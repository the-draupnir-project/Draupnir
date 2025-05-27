// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionError,
  ActionResult,
  ConfigRecoverableError,
  Logger,
  isError,
} from "matrix-protection-suite";
import { IConfig } from "../config";
import { DraupnirFactory } from "./DraupnirFactory";
import { Draupnir } from "../Draupnir";
import {
  StringUserID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { SafeModeDraupnir } from "../safemode/DraupnirSafeMode";
import { SafeModeCause, SafeModeReason } from "../safemode/SafeModeCause";
import {
  DraupnirRestartError,
  SafeModeToggle,
} from "../safemode/SafeModeToggle";
import { ResultError } from "@gnuxie/typescript-result";
import { SafeModeBootOption } from "../safemode/BootOption";

const log = new Logger("StandardDraupnirManager");

export class StandardDraupnirManager {
  private readonly draupnir = new Map<StringUserID, Draupnir>();
  private readonly failedDraupnir = new Map<StringUserID, UnstartedDraupnir>();
  private readonly safeModeDraupnir = new Map<StringUserID, SafeModeDraupnir>();

  public constructor(protected readonly draupnirFactory: DraupnirFactory) {
    // nothing to do.
  }

  public makeSafeModeToggle(
    clientUserID: StringUserID,
    managementRoom: MatrixRoomID,
    config: IConfig
  ): SafeModeToggle {
    // We need to alias to make the toggle frankly.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const draupnirManager = this;
    const toggle: SafeModeToggle = Object.freeze({
      async switchToSafeMode(cause: SafeModeCause) {
        return draupnirManager.makeSafeModeDraupnir(
          clientUserID,
          managementRoom,
          config,
          cause
        );
      },
      async switchToDraupnir() {
        return draupnirManager.makeDraupnir(
          clientUserID,
          managementRoom,
          config
        );
      },
    });
    return toggle;
  }

  public async makeDraupnir(
    clientUserID: StringUserID,
    managementRoom: MatrixRoomID,
    config: IConfig
  ): Promise<ActionResult<Draupnir, DraupnirRestartError | ResultError>> {
    this.safeModeDraupnir.delete(clientUserID);
    const draupnir = await this.draupnirFactory.makeDraupnir(
      clientUserID,
      managementRoom,
      config,
      this.makeSafeModeToggle(clientUserID, managementRoom, config)
    );
    if (this.isNormalDraupnir(clientUserID)) {
      return ActionError.Result(
        `There is a draupnir for ${clientUserID} already running`
      );
    }
    if (isError(draupnir)) {
      this.reportUnstartedDraupnir(
        DraupnirFailType.InitializationError,
        draupnir.error,
        clientUserID
      );
      switch (config.safeMode?.bootOption) {
        case SafeModeBootOption.Never:
          return draupnir;
        case SafeModeBootOption.RecoveryOnly:
          if (!(draupnir.error instanceof ConfigRecoverableError)) {
            return draupnir;
          }
        // fallthrough
        default: {
          log.error(
            `Failed to start draupnir ${clientUserID}, switching to safe mode as configured`,
            draupnir.error
          );
          const safeModeResult = await this.makeSafeModeDraupnir(
            clientUserID,
            managementRoom,
            config,
            {
              reason: SafeModeReason.InitializationError,
              error: draupnir.error,
            }
          );
          if (isError(safeModeResult)) {
            return safeModeResult;
          } else {
            return DraupnirRestartError.Result(
              `Failed to start draupnir ${clientUserID}, switching to safe mode as configured`,
              { safeModeDraupnir: safeModeResult.ok }
            );
          }
        }
      }
    }
    this.draupnir.set(clientUserID, draupnir.ok);
    this.failedDraupnir.delete(clientUserID);
    draupnir.ok.start();
    return draupnir;
  }

  public async makeSafeModeDraupnir(
    clientUserID: StringUserID,
    managementRoom: MatrixRoomID,
    config: IConfig,
    cause: SafeModeCause
  ): Promise<ActionResult<SafeModeDraupnir>> {
    if (this.isSafeModeDraupnir(clientUserID)) {
      return ActionError.Result(
        `There is a draupnir for ${clientUserID} already running`
      );
    }
    const safeModeDraupnir = await this.draupnirFactory.makeSafeModeDraupnir(
      clientUserID,
      managementRoom,
      config,
      cause,
      this.makeSafeModeToggle(clientUserID, managementRoom, config)
    );
    if (isError(safeModeDraupnir)) {
      this.reportUnstartedDraupnir(
        DraupnirFailType.InitializationError,
        safeModeDraupnir.error,
        clientUserID
      );
      return safeModeDraupnir;
    }
    safeModeDraupnir.ok.start();
    this.safeModeDraupnir.set(clientUserID, safeModeDraupnir.ok);
    this.draupnir.delete(clientUserID);
    this.failedDraupnir.delete(clientUserID);
    return safeModeDraupnir;
  }

  private isNormalDraupnir(draupnirClientID: StringUserID): boolean {
    return this.draupnir.has(draupnirClientID);
  }

  private isSafeModeDraupnir(draupnirClientID: StringUserID): boolean {
    return this.safeModeDraupnir.has(draupnirClientID);
  }

  /**
   * Whether the draupnir is available to the user, either normally or via safe mode.
   */
  public isDraupnirAvailable(draupnirClientID: StringUserID): boolean {
    return (
      this.isNormalDraupnir(draupnirClientID) ||
      this.isSafeModeDraupnir(draupnirClientID)
    );
  }

  public isDraupnirFailed(draupnirClientID: StringUserID): boolean {
    return this.failedDraupnir.has(draupnirClientID);
  }

  public reportUnstartedDraupnir(
    failType: DraupnirFailType,
    cause: unknown,
    draupnirClientID: StringUserID
  ): void {
    this.failedDraupnir.set(
      draupnirClientID,
      new UnstartedDraupnir(draupnirClientID, failType, cause)
    );
  }

  public getUnstartedDraupnirs(): UnstartedDraupnir[] {
    return [...this.failedDraupnir.values()];
  }

  public findUnstartedDraupnir(
    draupnirClientID: StringUserID
  ): UnstartedDraupnir | undefined {
    return this.failedDraupnir.get(draupnirClientID);
  }

  public findRunningDraupnir(
    draupnirClientID: StringUserID
  ): Draupnir | undefined {
    return this.draupnir.get(draupnirClientID);
  }

  public stopDraupnir(clientUserID: StringUserID): void {
    const draupnir = this.draupnir.get(clientUserID);
    if (draupnir === undefined) {
      return;
    } else {
      draupnir.stop();
      this.draupnir.delete(clientUserID);
    }
  }
}

export class UnstartedDraupnir {
  constructor(
    public readonly clientUserID: StringUserID,
    public readonly failType: DraupnirFailType,
    public readonly cause: unknown
  ) {
    // nothing to do.
  }
}

export enum DraupnirFailType {
  Unauthorized = "Unauthorized",
  StartError = "StartError",
  InitializationError = "InitializationError",
}

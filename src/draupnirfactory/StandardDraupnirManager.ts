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
  Task,
  isError,
} from "matrix-protection-suite";
import { IConfig } from "../config";
import { DraupnirFactory } from "./DraupnirFactory";
import { Draupnir } from "../Draupnir";
import {
  StringUserID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";

export class StandardDraupnirManager {
  private readonly draupnir = new Map<StringUserID, Draupnir>();
  private readonly failedDraupnir = new Map<StringUserID, UnstartedDraupnir>();

  public constructor(protected readonly draupnirFactory: DraupnirFactory) {
    // nothing to do.
  }

  public async makeDraupnir(
    clientUserID: StringUserID,
    managementRoom: MatrixRoomID,
    config: IConfig
  ): Promise<ActionResult<Draupnir>> {
    const draupnir = await this.draupnirFactory.makeDraupnir(
      clientUserID,
      managementRoom,
      config
    );
    if (this.isDraupnirListening(clientUserID)) {
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
      return draupnir;
    }
    // FIXME: This is a little more than suspect that there are no handlers if starting fails?
    // unclear to me what can fail though.
    void Task(draupnir.ok.start());
    this.draupnir.set(clientUserID, draupnir.ok);
    this.failedDraupnir.delete(clientUserID);
    return draupnir;
  }

  public isDraupnirListening(draupnirClientID: StringUserID): boolean {
    return this.draupnir.has(draupnirClientID);
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

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
  MatrixRoomID,
  StringUserID,
  Task,
  isError,
} from "matrix-protection-suite";
import { IConfig } from "../config";
import { DraupnirFactory } from "./DraupnirFactory";
import { Draupnir } from "../Draupnir";

export class StandardDraupnirManager {
  private readonly readyDraupnirs = new Map<StringUserID, Draupnir>();
  private readonly listeningDraupnirs = new Map<StringUserID, Draupnir>();
  private readonly failedDraupnirs = new Map<StringUserID, UnstartedDraupnir>();

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
    if (this.isDraupnirReady(clientUserID)) {
      return ActionError.Result(
        `There is a draupnir for ${clientUserID} already waiting to be started`
      );
    } else if (this.isDraupnirListening(clientUserID)) {
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
    this.readyDraupnirs.set(clientUserID, draupnir.ok);
    this.failedDraupnirs.delete(clientUserID);
    return draupnir;
  }

  public isDraupnirReady(draupnirClientID: StringUserID): boolean {
    return this.readyDraupnirs.has(draupnirClientID);
  }

  public isDraupnirListening(draupnirClientID: StringUserID): boolean {
    return this.listeningDraupnirs.has(draupnirClientID);
  }

  public isDraupnirFailed(draupnirClientID: StringUserID): boolean {
    return this.failedDraupnirs.has(draupnirClientID);
  }

  public reportUnstartedDraupnir(
    failType: DraupnirFailType,
    cause: unknown,
    draupnirClientID: StringUserID
  ): void {
    this.failedDraupnirs.set(
      draupnirClientID,
      new UnstartedDraupnir(draupnirClientID, failType, cause)
    );
  }

  public getUnstartedDraupnirs(): UnstartedDraupnir[] {
    return [...this.failedDraupnirs.values()];
  }

  public findUnstartedDraupnir(
    draupnirClientID: StringUserID
  ): UnstartedDraupnir | undefined {
    return this.failedDraupnirs.get(draupnirClientID);
  }

  public findRunningDraupnir(
    draupnirClientID: StringUserID
  ): Draupnir | undefined {
    return this.listeningDraupnirs.get(draupnirClientID);
  }

  public startDraupnir(clientUserID: StringUserID): void {
    const draupnir = this.readyDraupnirs.get(clientUserID);
    if (draupnir === undefined) {
      throw new TypeError(
        `Trying to start a draupnir that hasn't been created ${clientUserID}`
      );
    }
    // FIXME: This is a little more than suspect that there are no handlers if starting fails?
    // unclear to me what can fail though.
    void Task(draupnir.start());
    this.listeningDraupnirs.set(clientUserID, draupnir);
    this.readyDraupnirs.delete(clientUserID);
  }

  public stopDraupnir(clientUserID: StringUserID): void {
    const draupnir = this.listeningDraupnirs.get(clientUserID);
    if (draupnir === undefined) {
      return;
    } else {
      draupnir.stop();
      this.listeningDraupnirs.delete(clientUserID);
      this.readyDraupnirs.set(clientUserID, draupnir);
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

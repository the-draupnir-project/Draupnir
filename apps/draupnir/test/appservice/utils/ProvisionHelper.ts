// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import { Draupnir } from "../../../src/Draupnir";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

export interface ProvisionHelper {
  /**
   * Automatically make a draupnir and a management room.
   */
  provisionDraupnir(requestingUserID: StringUserID): Promise<Result<Draupnir>>;
}

export class StandardProvisionHelper implements ProvisionHelper {
  public constructor(private readonly appservice: MjolnirAppService) {
    // nothing to do.
  }
  async provisionDraupnir(
    requestingUserID: StringUserID
  ): Promise<Result<Draupnir>> {
    const provisionResult =
      await this.appservice.draupnirManager.provisionNewDraupnir(
        requestingUserID
      );
    if (isError(provisionResult)) {
      return provisionResult;
    }
    const draupnir = await this.appservice.draupnirManager.getRunningDraupnir(
      this.appservice.draupnirManager.draupnirMXID(provisionResult.ok),
      requestingUserID
    );
    if (draupnir === undefined) {
      return ResultError.Result(`Failed to find draupnir after provisioning`);
    }
    return Ok(draupnir);
  }
}

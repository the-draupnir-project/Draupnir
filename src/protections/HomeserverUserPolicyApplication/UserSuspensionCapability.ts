// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AccountRestriction,
  SynapseAdminClient,
} from "matrix-protection-suite-for-matrix-bot-sdk";
import { UserRestrictionCapability } from "./UserRestrictionCapability";
import { UserAuditLog } from "./UserAuditLog";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule, Logger } from "matrix-protection-suite";
import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { isUserAccountRestricted } from "./HomeserverUserPurgingDeactivate";

const log = new Logger("SynapseAdminUserSuspensionCapability");

export class SynapseAdminUserSuspensionCapability
  implements UserRestrictionCapability
{
  public readonly requiredPermissions = [];
  public readonly requiredStatePermissions = [];
  public readonly requiredEventPermissions = [];

  public constructor(
    private readonly synapseAdminClient: SynapseAdminClient,
    private readonly userAuditLog: UserAuditLog
  ) {
    // nothing to do here.
  }
  public async isUserRestricted(
    userID: StringUserID
  ): Promise<Result<boolean>> {
    const userDetails = await this.synapseAdminClient.getUserDetails(userID);
    if (isError(userDetails)) {
      return userDetails;
    } else if (!userDetails.ok) {
      return ResultError.Result(
        `Synapse cannot find details for the user ${userID}`
      );
    } else {
      return Ok(isUserAccountRestricted(userDetails.ok));
    }
  }
  public async restrictUser(
    userID: StringUserID,
    options: { rule: LiteralPolicyRule | null; sender: StringUserID }
  ): Promise<Result<void>> {
    const suspendResult = await this.synapseAdminClient.suspendUser(userID);
    if (isError(suspendResult)) {
      return suspendResult;
    }
    const logResult = await this.userAuditLog.recordUserRestriction(
      userID,
      AccountRestriction.Suspended,
      options
    );
    if (isError(logResult)) {
      log.error("Failed to audit a suspension", userID);
      return logResult.elaborate("Failed to audit the suspension");
    }
    return Ok(undefined);
  }

  public async unrestrictUser(
    userID: StringUserID,
    sender: StringUserID
  ): Promise<Result<void>> {
    const unsuspendResult =
      await this.synapseAdminClient.unrestrictUser(userID);
    if (isError(unsuspendResult)) {
      return unsuspendResult;
    }
    const auditResult = await this.userAuditLog.recordUserRestriction(
      userID,
      unsuspendResult.ok,
      { sender, rule: null }
    );
    if (isError(auditResult)) {
      return auditResult.elaborate(
        "Failed to audit the unsuspension of a user"
      );
    }
    return Ok(undefined);
  }
  isSimulated?: true;
}

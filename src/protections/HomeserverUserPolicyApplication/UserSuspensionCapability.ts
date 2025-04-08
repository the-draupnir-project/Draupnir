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
import {
  describeCapabilityProvider,
  LiteralPolicyRule,
  Logger,
} from "matrix-protection-suite";
import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { isUserAccountRestricted } from "./HomeserverUserPurgingDeactivate";
import { Draupnir } from "../../Draupnir";
import "./UserRestrictionCapability";

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
    }
    if (!userDetails.ok) {
      return ResultError.Result(
        `Synapse cannot find details for the user ${userID}`
      );
    }
    const isUserRestricted = isUserAccountRestricted(userDetails.ok);
    if (!isUserRestricted) {
      return Ok(false);
    }
    // We intentionally update the audit log here to keep our local information
    // accurate.
    const auditResult = await this.userAuditLog.isUserRestricted(userID);
    if (isError(auditResult)) {
      log.error("Failed to check if user is restricted", userID);
      return Ok(isUserRestricted);
    } else if (auditResult.ok) {
      log.debug("Recording missing user restriction", userID);
      const logResult = await this.userAuditLog.recordExistingUserRestriction(
        userID,
        AccountRestriction.Suspended
      );
      if (isError(logResult)) {
        log.error("Failed to audit a missing user restriction", userID);
      }
    }
    return Ok(isUserRestricted);
  }
  public async restrictUser(
    userID: StringUserID,
    options: { rule: LiteralPolicyRule | null; sender: StringUserID }
  ): Promise<Result<AccountRestriction>> {
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
    return Ok(AccountRestriction.Suspended);
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

describeCapabilityProvider<Draupnir>({
  name: SynapseAdminUserSuspensionCapability.name,
  description: `A capability to suspend users on the homeserver`,
  interface: "UserRestrictionCapability",
  factory(description, draupnir) {
    if (
      draupnir.synapseAdminClient === undefined ||
      draupnir.stores.restrictionAuditLog === undefined
    ) {
      throw new TypeError(
        "This capability requires the SynapseAdminClient and the user restriction audit log to be available to draupnir, and they are not in your configuration."
      );
    }
    return new SynapseAdminUserSuspensionCapability(
      draupnir.synapseAdminClient,
      draupnir.stores.restrictionAuditLog
    );
  },
});

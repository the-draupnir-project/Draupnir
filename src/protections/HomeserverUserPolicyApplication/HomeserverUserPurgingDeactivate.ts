// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// Uses the user details api to check if the user is already locked or whatever
// calls the redact thing
// polls until it's done
// deactivates the user
// this service needs to be attached to draupnir but can be referenced
// in consequences.

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import {
  ConstantPeriodItemBatch,
  LiteralPolicyRule,
  Logger,
  StandardBatcher,
} from "matrix-protection-suite";
import { SynapseAdminClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { deactivateUser } from "./deactivateUser";
import { UserRestrictionAuditLog } from "./UserRestrictionAuditLog";
import { UserDetailsResponse } from "matrix-protection-suite-for-matrix-bot-sdk/dist/SynapseAdmin/UserDetailsEndpoint";

const log = new Logger("HomeserverUserPurgingDeactivate");

export function isUserAccountRestricted(details: UserDetailsResponse): boolean {
  return (
    details.deactivated ||
    details.shadow_banned ||
    details.locked ||
    details.deactivated
  );
}

// FIXME: Why isn't glob policy rule allowed here?
type DeactivationDetails = {
  redactionID: string;
  sender: StringUserID;
  policy: LiteralPolicyRule | null;
};

export class HomeserverUserPurgingDeactivate {
  private readonly batcher: StandardBatcher<StringUserID, DeactivationDetails>;
  public constructor(
    private readonly synapseAdminClient: SynapseAdminClient,
    private readonly userAuditLog: UserRestrictionAuditLog
  ) {
    this.batcher = new StandardBatcher(
      () =>
        new ConstantPeriodItemBatch<StringUserID, DeactivationDetails>(
          this.checkProgress,
          { waitPeriodMS: 20_000 }
        )
    );
  }

  public async beginPurgeUser(
    userID: StringUserID,
    {
      rule,
      sender,
    }: {
      rule: LiteralPolicyRule | null;
      sender: StringUserID;
    }
  ): Promise<Result<void>> {
    const userDetails = await this.synapseAdminClient.getUserDetails(userID);
    if (isError(userDetails)) {
      return userDetails.elaborate(
        "Should be able to fetch user details before purging"
      );
    }
    // We make sure we have shadow banned their account while we redact.
    // This is to make sure they don't send anymore while we decomission the account.
    if (!userDetails.ok || !isUserAccountRestricted(userDetails.ok)) {
      const shadowBanResult =
        await this.synapseAdminClient.shadowBanUser(userID);
      if (isError(shadowBanResult)) {
        log.error(
          "Failed to shadowban user before starting pre-deactivation redaction",
          userID
        );
      }
    }
    const redactionStartResult =
      await this.synapseAdminClient.redactUser(userID);
    if (isError(redactionStartResult)) {
      return redactionStartResult.elaborate(
        "Failed to begin pre-deactivation redaction process"
      );
    }
    this.batcher.add(userID, {
      policy: rule,
      sender,
      redactionID: redactionStartResult.ok.redact_id,
    });
    return Ok(undefined);
  }

  private readonly checkProgress = async function (
    this: HomeserverUserPurgingDeactivate,
    rawEntries: [StringUserID, DeactivationDetails][]
  ) {
    for (const [userID, details] of rawEntries) {
      const redactionStatus =
        await this.synapseAdminClient.getUserRedactionStatus(
          details.redactionID
        );
      if (isError(redactionStatus)) {
        log.error(
          "Unable to query the status of a redaction for a user",
          userID,
          details.redactionID
        );
      } else if (
        redactionStatus.ok?.status === "active" ||
        redactionStatus.ok?.status === "scheduled"
      ) {
        this.batcher.add(userID, details);
        continue;
      }
      const deactivateResult = await deactivateUser(
        userID,
        this.synapseAdminClient,
        this.userAuditLog,
        {
          rule: details.policy,
          sender: details.sender,
        }
      );
      if (isError(deactivateResult)) {
        log.error("Unable to deactivate user", userID);
        continue;
      }
    }
  }.bind(this);
}

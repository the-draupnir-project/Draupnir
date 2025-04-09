// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError } from "@gnuxie/typescript-result";
import {
  isStringUserID,
  MatrixGlob,
  StringServerName,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  LiteralPolicyRule,
  Logger,
  PolicyRuleChange,
  PolicyRuleChangeType,
  PolicyRuleMatchType,
  PolicyRuleType,
  Recommendation,
  Task,
  WatchedPolicyRooms,
} from "matrix-protection-suite";
import { UserRestrictionCapability } from "./UserRestrictionCapability";
import { UserAuditLog } from "./UserAuditLog";

const log = new Logger("HomeserverUserPolicyApplication");

export class HomeserverUserPolicyApplication {
  public constructor(
    private readonly consequences: UserRestrictionCapability,
    private readonly userAuditLog: UserAuditLog,
    private readonly watchedPolicyRooms: WatchedPolicyRooms,
    private readonly serverName: StringServerName,
    private readonly automaticallyRedactForReasons: MatrixGlob[]
  ) {
    // nothing to do.
  }

  private isPolicyElegiableForSuspension(policy: LiteralPolicyRule): boolean {
    if (policy.kind !== PolicyRuleType.User) {
      return false;
    }
    if (!isStringUserID(policy.entity)) {
      return false;
    }
    if (userServerName(policy.entity) !== this.serverName) {
      return false;
    }
    if (policy.recommendation === Recommendation.Takedown) {
      return true;
    } else if (
      // FIXME: This would be a policy eligible for purging,
      // not suspension, any banned local user should be suspended.
      policy.recommendation === Recommendation.Ban &&
      this.automaticallyRedactForReasons.some((glob) =>
        glob.test(policy.reason)
      )
    ) {
      return true;
    } else {
      return false;
    }
  }

  public handlePolicyChange(changes: PolicyRuleChange[]): void {
    void Task(
      (async () => {
        for (const change of changes) {
          if (change.changeType === PolicyRuleChangeType.Removed) {
            continue;
            // FIXME: Don't we want to unsuspend here?
            // FIXME: What about modifying from a automaticallyRedactReason to a non redact reason?
          }
          const policy = change.rule;
          if (policy.matchType !== PolicyRuleMatchType.Literal) {
            continue;
          }
          if (!this.isPolicyElegiableForSuspension(policy)) {
            continue;
          }
          // FIXME: If the consequence is going to check if the user is restricted
          // and update the audit log if they are not, then HMMMM
          // the audit log probably needs to do the updating on isUserRestricted
          // rather than on .restrictUser...
          const isUserSuspended = await this.consequences.isUserRestricted(
            policy.entity as StringUserID
          );
          if (isError(isUserSuspended)) {
            log.error(
              `Failed to check if a user ${policy.entity} is suspended`,
              isUserSuspended.error
            );
          } else if (isUserSuspended.ok) {
            continue; // user is already suspended
          }
          const suspensionResult = await this.consequences.restrictUser(
            policy.entity as StringUserID,
            {
              rule: policy,
              sender: policy.sourceEvent.sender,
            }
          );
          if (isError(suspensionResult)) {
            log.error(
              `Failed to suspend user ${policy.entity}`,
              suspensionResult.error
            );
          }
        }
      })()
    );
  }

  public handleProtectionEnable(): void {
    void Task(
      (async () => {
        log.debug("Findind local users to suspend at protection enable...");
        const revision = this.watchedPolicyRooms.currentRevision;
        // FIXME: We need to also paginate through all supsended, shadowbanned, and locked
        // users to see if they have a matching policy and recommend that they either
        // be deactivated or have their restrictions lifted.
        // probably something for another component of the protection to do.
        // the users list api lets us also poll by user creation so it's pretty cool.
        // https://element-hq.github.io/synapse/latest/admin_api/user_admin_api.html#list-accounts-v2

        const literalRules = [
          ...revision.allRulesOfType(PolicyRuleType.User, Recommendation.Ban),
          ...revision.allRulesOfType(
            PolicyRuleType.User,
            Recommendation.Takedown
          ),
        ].filter(
          (policy) =>
            policy.matchType === PolicyRuleMatchType.Literal &&
            isStringUserID(policy.entity) &&
            userServerName(policy.entity) === this.serverName
        ) as LiteralPolicyRule[];
        for (const policy of literalRules) {
          const userID = policy.entity as StringUserID;
          const isUserRestrictedResult =
            await this.userAuditLog.isUserRestricted(userID);
          if (isError(isUserRestrictedResult)) {
            log.error(
              `Failed to check if a user ${userID} is restricted`,
              isUserRestrictedResult.error
            );
            continue;
          }
          if (isUserRestrictedResult.ok) {
            continue;
          }
          // FIXME: The suspension consequence should audit a suspension
          // when we notice that they are already suspended at the homserver level
          // but the suspsension wasn't audited.
          // FIXME: The consequence renderer may also need to be aware of this
          // and only send a message when the suspension has actually gone through.
          const suspensionResult = await this.consequences.restrictUser(
            userID,
            {
              rule: policy,
              sender: policy.sourceEvent.sender,
            }
          );
          if (isError(suspensionResult)) {
            log.error(
              `Failed to suspend user ${userID}`,
              suspensionResult.error
            );
          }
        }
        // NOTE: If we find out that we're polling lots of accounts whether
        // they are restricted and this is taking a significant amount of time
        // we should recommend that the policies that are relevant be removed.
        // if the account has been deactivated.
        // And the policy has been instated for awhile (give enough time for
        // other communities to redact their spam who may be using the policy)
        log.debug("Finished suspending from policies at protection enable");
      })()
    );
  }
}

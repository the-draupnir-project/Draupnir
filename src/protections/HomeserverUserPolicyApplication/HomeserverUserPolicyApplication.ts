// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  isStringUserID,
  MatrixGlob,
  StringRoomID,
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
import { UserRestrictionAuditLog } from "./UserRestrictionAuditLog";
import { sendPromptDeactivation } from "../../commands/server-admin/DeactivateCommand";
import { ConfirmationPromptSender } from "../../commands/interface-manager/MatrixPromptForConfirmation";

const log = new Logger("HomeserverUserPolicyApplication");

export class HomeserverUserPolicyApplication {
  public constructor(
    private readonly managementRoomID: StringRoomID,
    private readonly consequences: UserRestrictionCapability,
    private readonly confirmationPromptSender: ConfirmationPromptSender,
    private readonly userAuditLog: UserRestrictionAuditLog,
    private readonly watchedPolicyRooms: WatchedPolicyRooms,
    private readonly serverName: StringServerName,
    private readonly automaticallyRedactForReasons: MatrixGlob[]
  ) {
    // nothing to do.
  }

  private isPolicyEligibleForRestriction(policy: LiteralPolicyRule): boolean {
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
    } else if (policy.recommendation === Recommendation.Ban) {
      return true;
    } else {
      return false;
    }
  }

  /**
   * Sometimes it makes sense to skip the audit log check if e.g. we want to really
   * make sure the user is restricted like on a policy change.
   * But when starting up in bulk, we want to check the audit log first to not do duplicate
   * actions.
   */
  private async isUserRestricted(
    userID: StringUserID,
    { checkAuditLog }: { checkAuditLog: boolean }
  ): Promise<Result<boolean>> {
    const auditResult = await (async () => {
      if (!checkAuditLog) {
        return Ok(false);
      }
      return await this.userAuditLog.isUserRestricted(userID);
    })();
    if (isError(auditResult)) {
      return auditResult.elaborate(
        "Failed to check audit log for user restriction"
      );
    }
    if (auditResult.ok) {
      return auditResult;
    } else {
      return await this.consequences.isUserRestricted(userID);
    }
  }

  public handlePolicyChange(changes: PolicyRuleChange[]): void {
    void Task(
      (async () => {
        for (const change of changes) {
          if (change.changeType === PolicyRuleChangeType.Removed) {
            if (
              change.rule.matchType === PolicyRuleMatchType.Literal &&
              isStringUserID(change.rule.entity)
            ) {
              const matchingPolicies = this.watchedPolicyRooms.currentRevision
                .allRulesMatchingEntity(change.rule.entity, {})
                .filter(
                  (policy) =>
                    policy.recommendation === Recommendation.Ban ||
                    policy.recommendation === Recommendation.Takedown
                );
              // If there are other policies targetting the user then we don't want to unrestrict them.
              if (matchingPolicies.length > 0) {
                continue;
              }
              const unrestrictResult = await this.consequences.unrestrictUser(
                change.rule.entity,
                change.event.sender
              );
              if (isError(unrestrictResult)) {
                log.error(
                  `Failed to unrestrict the user ${change.rule.entity}`,
                  unrestrictResult.error
                );
              }
            }
            continue;
            // FIXME: What about modifying from a automaticallyRedactReason to a non redact reason?
          }
          const policy = change.rule;
          if (policy.matchType !== PolicyRuleMatchType.Literal) {
            continue;
          }
          if (!this.isPolicyEligibleForRestriction(policy)) {
            continue;
          }
          const isUserRestricted = await this.consequences.isUserRestricted(
            policy.entity as StringUserID
          );
          if (isError(isUserRestricted)) {
            log.error(
              `Failed to check if a user ${policy.entity} is suspended`,
              isUserRestricted.error
            );
          } else if (isUserRestricted.ok) {
            continue; // user is already suspended
          }
          // FIXME: Takedown policy should really automatically deactivate
          // after a grace period or something.
          if (
            this.automaticallyRedactForReasons.some(
              (glob) =>
                glob.test(policy.reason) ||
                policy.recommendation === Recommendation.Takedown
            )
          ) {
            // prompt to also deactivate the user if they match globs
            sendPromptDeactivation(
              policy.entity as StringUserID,
              policy,
              this.managementRoomID,
              this.confirmationPromptSender,
              log
            );
          }
          const restrictionResult = await this.consequences.restrictUser(
            policy.entity as StringUserID,
            {
              rule: policy,
              sender: policy.sourceEvent.sender,
            }
          );
          if (isError(restrictionResult)) {
            log.error(
              `Failed to suspend user ${policy.entity}`,
              restrictionResult.error
            );
          }
        }
      })()
    );
  }

  public handleProtectionEnable(): void {
    // FIXME: We probably need to synchronise unrestricted users with the audit log
    // in the background too.
    void Task(
      (async () => {
        log.debug("Finding local users to suspend at protection enable...");
        const revision = this.watchedPolicyRooms.currentRevision;
        // FIXME: We need to also paginate through all suspended, shadowbanned, and locked
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
          const isUserRestrictedResult = await this.isUserRestricted(userID, {
            checkAuditLog: true,
          });
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

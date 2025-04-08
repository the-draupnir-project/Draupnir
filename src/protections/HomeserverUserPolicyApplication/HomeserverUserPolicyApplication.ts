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
import { UserSuspensionConsequences } from "./UserSuspensionCapability";
import { UserAuditLog } from "./UserAuditLog";

const log = new Logger("HomeserverUserPolicyApplication");

// So in order to track what local users have been deactivated or suspended
// we need a way to query them and either log that as an action or
// as something that we know has already happened so that we don't keep spamming
// the respective endpoints.

export class HomeserverUserPolicyApplication {
  public constructor(
    private readonly consequences: UserSuspensionConsequences,
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
          const isUserSuspended = await this.consequences.isUserSuspended(
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
          const suspensionResult = await this.consequences.suspendUser(
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

  // FIXME: Depending on the audit log like this probably isn't going to work
  // without passing through the function, ok yeah we can just pass through
  // a higher ordre function
  public handleProtectionEnable(): void {
    void Task(
      (async () => {
        const usersToSuspend = await this.userAuditLog.findUnrestrictedUsers(
          this.watchedPolicyRooms.currentRevision
        );
        if (isError(usersToSuspend)) {
          log.error(
            "Failed to fetch unsuspended users from the user audit log",
            usersToSuspend.error
          );
          return;
        }
        for (const [userID, policy] of usersToSuspend.ok) {
          const suspensionResult = await this.consequences.suspendUser(userID, {
            rule: policy,
            sender: policy.sourceEvent.sender,
          });
          if (isError(suspensionResult)) {
            log.error(
              `Failed to suspend user ${userID}`,
              suspensionResult.error
            );
          }
        }
      })()
    );
  }
}

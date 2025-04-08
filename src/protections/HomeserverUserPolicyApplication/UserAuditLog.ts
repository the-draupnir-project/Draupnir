// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import {
  StringServerName,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule, PolicyListRevision } from "matrix-protection-suite";

/**
 * An account restriction at the minimum stops the user from sending
 * messages.
 */
export enum AccountRestriction {
  Suspended = "suspended",
  Deactivated = "deactivated",
}

export interface UserAuditLog {
  isUserRestricted(userID: StringUserID): Promise<Result<boolean>>;
  recordUserRestriction(
    userID: StringUserID,
    restriction: AccountRestriction,
    options: {
      rule: LiteralPolicyRule | null;
      sender: StringUserID;
    }
  ): Promise<Result<void>>;
  // FIXME: Methods that record this should use `getUserDetails` to find
  // out which restriction is in place and reverse it.
  unrestrictUser(
    userID: StringUserID,
    sender: StringUserID
  ): Promise<Result<void>>;
  findUnrestrictedUsers(
    serverName: StringServerName,
    revision: PolicyListRevision
  ): Promise<Result<[StringUserID, LiteralPolicyRule][]>>;
  destroy(): void;
}

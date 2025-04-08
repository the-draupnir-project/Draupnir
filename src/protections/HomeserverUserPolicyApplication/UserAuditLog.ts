// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule } from "matrix-protection-suite";
import { AccountRestriction } from "matrix-protection-suite-for-matrix-bot-sdk";

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
  recordExistingUserRestriction(
    uesrID: StringUserID,
    restriction: AccountRestriction
  ): Promise<Result<void>>;
  unrestrictUser(
    userID: StringUserID,
    sender: StringUserID
  ): Promise<Result<void>>;
  destroy(): void;
}

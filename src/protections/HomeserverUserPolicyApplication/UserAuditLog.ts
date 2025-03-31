// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { LiteralPolicyRule } from "matrix-protection-suite";

export enum SuspensionType {
  Suspended = "suspended",
  Deactivated = "deactivated",
}

export interface UserAuditLog {
  isUserSuspended(userID: StringUserID): Promise<Result<boolean>>;
  suspendUser(
    userID: StringUserID,
    suspensionType: SuspensionType,
    options: {
      rule: LiteralPolicyRule | null;
      sender: StringUserID;
    }
  ): Promise<Result<void>>;
  unsuspendUser(
    userID: StringUserID,
    sender: StringUserID
  ): Promise<Result<void>>;
  destroy(): void;
}

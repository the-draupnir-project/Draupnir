// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import {
  Capability,
  CapabilityMethodSchema,
  describeCapabilityInterface,
  LiteralPolicyRule,
} from "matrix-protection-suite";
import { AccountRestriction } from "matrix-protection-suite-for-matrix-bot-sdk";

export interface UserRestrictionCapability extends Capability {
  isUserRestricted(userID: StringUserID): Promise<Result<boolean>>;
  restrictUser(
    userID: StringUserID,
    options: {
      rule: LiteralPolicyRule | null;
      sender: StringUserID;
    }
  ): Promise<Result<AccountRestriction>>;
  unrestrictUser(
    userID: StringUserID,
    sender: StringUserID
  ): Promise<Result<void>>;
}

const UserRestrictionCapability = Type.Object({
  unrestrictUser: CapabilityMethodSchema,
  restrictUser: CapabilityMethodSchema,
  isUserRestricted: CapabilityMethodSchema,
});

describeCapabilityInterface({
  name: "UserRestrictionCapability",
  description:
    "Capabilities to restrict and unrestrict users from the homeserver",
  schema: UserRestrictionCapability,
});

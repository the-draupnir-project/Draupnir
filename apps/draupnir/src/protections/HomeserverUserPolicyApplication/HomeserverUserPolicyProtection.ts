// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Type } from "@sinclair/typebox";
import {
  AbstractProtection,
  describeProtection,
  EDStatic,
  OwnLifetime,
  PolicyListRevision,
  PolicyRuleChange,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
} from "matrix-protection-suite";
import { UserRestrictionCapability } from "./UserRestrictionCapability";
import { Draupnir } from "../../Draupnir";
import { UserRestrictionAuditLog } from "./UserRestrictionAuditLog";
import { HomeserverUserPolicyApplication } from "./HomeserverUserPolicyApplication";
import {
  StringRoomID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { MatrixGlob } from "matrix-bot-sdk";
import { Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { SynapseAdminUserSuspensionCapability } from "./UserSuspensionCapability";
import {
  ConfirmationPromptSender,
  makeconfirmationPromptSender,
} from "@the-draupnir-project/mps-interface-adaptor";

const HomeserverUserPolicyProtectionSettings = Type.Object(
  {},
  { title: "HomeserverUserPolicyProtectionSettings" }
);

type HomeserverUserPolicyProtectionSettings = EDStatic<
  typeof HomeserverUserPolicyProtectionSettings
>;

type HomeserverUserPolicyProtectionCapabilities = {
  userRestrictionCapability: UserRestrictionCapability;
};

type HomeserverUserProtectionDescription = ProtectionDescription<
  Draupnir,
  typeof HomeserverUserPolicyProtectionSettings,
  HomeserverUserPolicyProtectionCapabilities
>;

export class HomeserverUserPolicyProtection
  extends AbstractProtection<HomeserverUserProtectionDescription>
  implements Protection<HomeserverUserProtectionDescription>
{
  private readonly policyApplication: HomeserverUserPolicyApplication;
  constructor(
    description: HomeserverUserProtectionDescription,
    lifetime: OwnLifetime<HomeserverUserProtectionDescription>,
    capabilities: HomeserverUserPolicyProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    auditLog: UserRestrictionAuditLog,
    automaticallyRedactForReasons: MatrixGlob[],
    managementRoomID: StringRoomID,
    confirmationPromptSender: ConfirmationPromptSender
  ) {
    super(description, lifetime, capabilities, protectedRoomsSet, {});
    this.policyApplication = new HomeserverUserPolicyApplication(
      managementRoomID,
      capabilities.userRestrictionCapability,
      confirmationPromptSender,
      auditLog,
      protectedRoomsSet.watchedPolicyRooms,
      userServerName(protectedRoomsSet.userID),
      automaticallyRedactForReasons
    );
    this.policyApplication.handleProtectionEnable();
  }
  handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<Result<void>> {
    this.policyApplication.handlePolicyChange(changes);
    return Promise.resolve(Ok(undefined));
  }
}

describeProtection<
  HomeserverUserPolicyProtectionCapabilities,
  Draupnir,
  typeof HomeserverUserPolicyProtectionSettings
>({
  name: HomeserverUserPolicyProtection.name,
  description: `A protection to suspend resident users matching policies from watched lists`,
  capabilityInterfaces: {
    userRestrictionCapability: "UserRestrictionCapability",
  },
  defaultCapabilities: {
    userRestrictionCapability: SynapseAdminUserSuspensionCapability.name,
  },
  configSchema: HomeserverUserPolicyProtectionSettings,
  async factory(
    description,
    lifetime,
    protectedRoomsSet,
    draupnir,
    capabilitySet,
    _settings
  ) {
    if (draupnir.stores.userRestrictionAuditLog === undefined) {
      return ResultError.Result(
        "This protection requires the user audit log to be available to draupnir, and they are not in your configuration."
      );
    }
    return Ok(
      new HomeserverUserPolicyProtection(
        description,
        lifetime,
        capabilitySet,
        protectedRoomsSet,
        draupnir.stores.userRestrictionAuditLog,
        draupnir.config.automaticallyRedactForReasons.map(
          (reason) => new MatrixGlob(reason)
        ),
        draupnir.managementRoomID,
        makeconfirmationPromptSender(draupnir)
      )
    );
  },
});

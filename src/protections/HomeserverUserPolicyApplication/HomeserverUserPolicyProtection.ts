// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Type } from "@sinclair/typebox";
import {
  AbstractProtection,
  describeProtection,
  EDStatic,
  PolicyListRevision,
  PolicyRuleChange,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
} from "matrix-protection-suite";
import { UserRestrictionCapability } from "./UserRestrictionCapability";
import { Draupnir } from "../../Draupnir";
import { UserAuditLog } from "./UserAuditLog";
import { HomeserverUserPolicyApplication } from "./HomeserverUserPolicyApplication";
import { userServerName } from "@the-draupnir-project/matrix-basic-types";
import { MatrixGlob } from "matrix-bot-sdk";
import { Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { SynapseAdminUserSuspensionCapability } from "./UserSuspensionCapability";

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
    capabilities: HomeserverUserPolicyProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    auditLog: UserAuditLog,
    automaticallyRedactForReasons: MatrixGlob[]
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.policyApplication = new HomeserverUserPolicyApplication(
      capabilities.userRestrictionCapability,
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
  description: `A protection to shutdown rooms matching policies from watched lists`,
  capabilityInterfaces: {
    userRestrictionCapability: "UserRestrictionCapability",
  },
  defaultCapabilities: {
    userRestrictionCapability: SynapseAdminUserSuspensionCapability.name,
  },
  configSchema: HomeserverUserPolicyProtectionSettings,
  factory(description, protectedRoomsSet, draupnir, capabilitySet, _settings) {
    if (draupnir.stores.restrictionAuditLog === undefined) {
      return ResultError.Result(
        "This protection requires the user audit log to be available to draupnir, and they are not in your configuration."
      );
    }
    return Ok(
      new HomeserverUserPolicyProtection(
        description,
        capabilitySet,
        protectedRoomsSet,
        draupnir.stores.restrictionAuditLog,
        draupnir.config.automaticallyRedactForReasons.map(
          (reason) => new MatrixGlob(reason)
        )
      )
    );
  },
});

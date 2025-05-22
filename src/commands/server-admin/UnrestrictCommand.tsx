// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  BasicInvocationInformation,
  describeCommand,
  MatrixUserIDPresentationType,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../../Draupnir";
import { Result, ResultError } from "@gnuxie/typescript-result";
import { SynapseAdminUserSuspensionCapability } from "../../protections/HomeserverUserPolicyApplication/UserSuspensionCapability";
import { DraupnirInterfaceAdaptor } from "../DraupnirCommandPrerequisites";

export const SynapseAdminUnrestrictUserCommand = describeCommand({
  summary:
    "Unrestrict a user on the homeserver if their account has been suspended or shadowbanned",
  parameters: tuple({
    name: "user",
    description: "The user to unrestrict",
    acceptor: MatrixUserIDPresentationType,
  }),
  async executor(
    draupnir: Draupnir,
    info: BasicInvocationInformation,
    _keywords,
    _rest,
    targetUser
  ): Promise<Result<void>> {
    if (
      draupnir.synapseAdminClient === undefined ||
      draupnir.stores.userRestrictionAuditLog === undefined
    ) {
      return ResultError.Result(
        "This command cannot be used without synapse admin"
      );
    }
    const capability = new SynapseAdminUserSuspensionCapability(
      draupnir.synapseAdminClient,
      draupnir.stores.userRestrictionAuditLog
    );
    return await capability.unrestrictUser(
      targetUser.toString(),
      info.commandSender
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminUnrestrictUserCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  BasicInvocationInformation,
  MatrixUserIDPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { ActionError } from "matrix-protection-suite";
import { Draupnir } from "../../Draupnir";
import { DraupnirInterfaceAdaptor } from "../DraupnirCommandPrerequisites";
import { deactivateUser } from "../../protections/HomeserverUserPolicyApplication/deactivateUser";

export const SynapseAdminDeactivateCommand = describeCommand({
  summary: "Deactivate a user on the homeserver.",
  parameters: tuple({
    name: "user",
    description: "The user to deactivate",
    acceptor: MatrixUserIDPresentationType,
  }),
  keywords: {
    keywordDescriptions: {
      "purge-messages": {
        isFlag: true,
        description:
          "Restrict access to the account until Draupnir removes all of their messages, and then finally deactivate.",
      },
    },
  },
  async executor(
    draupnir: Draupnir,
    info: BasicInvocationInformation,
    keywords,
    _rest,
    targetUser
  ): Promise<Result<void>> {
    const isAdmin = await draupnir.synapseAdminClient?.isSynapseAdmin();
    if (
      isAdmin === undefined ||
      isError(isAdmin) ||
      !isAdmin.ok ||
      !draupnir.purgingDeactivate
    ) {
      return ActionError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    if (draupnir.stores.restrictionAuditLog === undefined) {
      return ResultError.Result(
        "The user restriction audit log is not configured"
      );
    }
    if (draupnir.synapseAdminClient === undefined) {
      throw new TypeError("Shouldn't be happening at this point");
    }
    const isPurgingDeactivate = keywords.getKeywordValue<boolean>(
      "purge-messages",
      false
    );
    const deactivateResult = await (() =>
      isPurgingDeactivate
        ? draupnir.purgingDeactivate.beginPurgeUser(targetUser.toString(), {
            sender: info.commandSender,
            rule: null,
          })
        : deactivateUser(
            targetUser.toString(),
            draupnir.synapseAdminClient,
            draupnir.stores.restrictionAuditLog,
            {
              sender: info.commandSender,
              rule: null,
            }
          ))();
    return deactivateResult;
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminDeactivateCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
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
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

type DeactivateUserPreview = {
  isPurgingMessages: boolean;
  isNoConfirm: boolean;
  targetUser: StringUserID;
  creation_timestamp: number;
  displayname: string | undefined;
};

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
      "no-confirm": {
        isFlag: true,
        description:
          "Runs the command without the preview of the unban and the confirmation prompt.",
      },
    },
  },
  async executor(
    draupnir: Draupnir,
    info: BasicInvocationInformation,
    keywords,
    _rest,
    targetUser
  ): Promise<Result<DeactivateUserPreview>> {
    const synapseAdminClient = draupnir.synapseAdminClient;
    const isAdmin = await synapseAdminClient?.isSynapseAdmin();
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
    if (synapseAdminClient === undefined) {
      throw new TypeError("Shouldn't be happening at this point");
    }
    const isNoConfirm = keywords.getKeywordValue<boolean>("no-confirm", false);
    const isPurgingMessages = keywords.getKeywordValue<boolean>(
      "purge-messages",
      false
    );
    const previewResult = await (async () => {
      const details = await synapseAdminClient.getUserDetails(
        targetUser.toString()
      );
      if (isError(details)) {
        return details.elaborate(
          `Failed to get details for the user ${targetUser.toString()}`
        );
      } else if (!details.ok) {
        return ResultError.Result(
          `Couldn't find a residident user with the ID ${targetUser.toString()}`
        );
      }
      return Ok({
        targetUser: targetUser.toString(),
        creation_timestamp: details.ok.creation_ts,
        displayname: details.ok.displayname,
        isPurgingMessages: Boolean(isPurgingMessages),
        isNoConfirm: Boolean(isNoConfirm),
      } satisfies DeactivateUserPreview);
    })();
    if (isNoConfirm) {
      return previewResult;
    }
    const deactivateResult = await (() =>
      isPurgingMessages
        ? draupnir.purgingDeactivate.beginPurgeUser(targetUser.toString(), {
            sender: info.commandSender,
            rule: null,
          })
        : deactivateUser(
            targetUser.toString(),
            synapseAdminClient,
            draupnir.stores.restrictionAuditLog,
            {
              sender: info.commandSender,
              rule: null,
            }
          ))();
    if (isError(deactivateResult)) {
      return deactivateResult.elaborate(
        `Failed to deactivate the user ${targetUser.toString()}`
      );
    } else {
      return previewResult;
    }
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminDeactivateCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

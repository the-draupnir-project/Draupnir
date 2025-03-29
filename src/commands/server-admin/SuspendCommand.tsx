// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  DeadDocumentJSX,
  describeCommand,
  MatrixUserIDPresentationType,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../../Draupnir";
import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { DraupnirInterfaceAdaptor } from "../DraupnirCommandPrerequisites";
import { renderMentionPill } from "../interface-manager/MatrixHelpRenderer";

type SuspensionPreview = {
  userID: StringUserID;
};

export const SynapseAdminSuspendUserCommand = describeCommand({
  summary:
    "Suspend a user on the homeserver, this allows them to login but not interact with anything",
  parameters: tuple({
    name: "user",
    description: "The user to suspend",
    acceptor: MatrixUserIDPresentationType,
  }),
  keywords: {
    keywordDescriptions: {
      "no-confirm": {
        isFlag: true,
        description:
          "Runs the command without the preview of the unban and the confirmation prompt.",
      },
    },
  },
  async executor(
    draupnir: Draupnir,
    _info,
    keywords,
    _rest,
    targetUser
  ): Promise<Result<SuspensionPreview>> {
    const isAdmin = await draupnir.synapseAdminClient?.isSynapseAdmin();
    if (
      draupnir.synapseAdminClient === undefined ||
      isAdmin === undefined ||
      isError(isAdmin) ||
      !isAdmin.ok
    ) {
      return ResultError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    const preview = {
      userID: targetUser.toString(),
    };
    const isNoConfirm = keywords.getKeywordValue<boolean>("no-confirm", false);
    if (!isNoConfirm) {
      return Ok(preview);
    }
    const suspensionResult = await draupnir.synapseAdminClient.suspendUser(
      targetUser.toString()
    );
    if (isError(suspensionResult)) {
      return suspensionResult;
    } else {
      return Ok(preview);
    }
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminSuspendUserCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
  confirmationPromptJSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        You are about to suspend the user{" "}
        {renderMentionPill(commandResult.ok.userID, commandResult.ok.userID)}{" "}
        <code>{commandResult.ok.userID}</code>. Doing so will prevent further
        activity from their account. However, they will still be able to login,
        manage their account, and redact messages. See
        https://spec.matrix.org/v1.14/client-server-api/#account-suspension for
        a complete explanation.
      </root>
    );
  },
  JSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        The user <code>{commandResult.ok.userID}</code> has been suspended.
      </root>
    );
  },
});

export const SynapseAdminUnsuspendUserCommand = describeCommand({
  summary: "Unsuspend a user on the homeserver that was previously suspended",
  parameters: tuple({
    name: "user",
    description: "The user to unsuspend",
    acceptor: MatrixUserIDPresentationType,
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    targetUser
  ): Promise<Result<SuspensionPreview>> {
    const isAdmin = await draupnir.synapseAdminClient?.isSynapseAdmin();
    if (
      draupnir.synapseAdminClient === undefined ||
      isAdmin === undefined ||
      isError(isAdmin) ||
      !isAdmin.ok
    ) {
      return ResultError.Result(
        "I am not a Synapse administrator, or the endpoint to deactivate a user is blocked"
      );
    }
    const preview = {
      userID: targetUser.toString(),
    };
    const suspensionResult = await draupnir.synapseAdminClient.unsuspendUser(
      targetUser.toString()
    );
    if (isError(suspensionResult)) {
      return suspensionResult;
    } else {
      return Ok(preview);
    }
  },
});

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminUnsuspendUserCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
  JSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        The user <code>{commandResult.ok.userID}</code> has been unsuspended.
      </root>
    );
  },
});

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
  DeadDocumentJSX,
  DocumentNode,
  MatrixUserIDPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import {
  ActionError,
  LiteralPolicyRule,
  Logger,
  Task,
} from "matrix-protection-suite";
import { Draupnir } from "../../Draupnir";
import { DraupnirInterfaceAdaptor } from "../DraupnirCommandPrerequisites";
import { deactivateUser } from "../../protections/HomeserverUserPolicyApplication/deactivateUser";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { renderRuleSummary } from "../Rules";
import { ConfirmationPromptSender } from "../interface-manager/MatrixPromptForConfirmation";

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
    if (draupnir.stores.userRestrictionAuditLog === undefined) {
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
        displayname: details.ok.displayname ?? undefined,
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
            draupnir.stores.userRestrictionAuditLog,
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

function renderUserDetails(preview: DeactivateUserPreview) {
  return (
    <details>
      <summary>
        Details for <code>{preview.targetUser}</code>
      </summary>
      <ul>
        <li>
          Creation date:{" "}
          <code>
            {new Date(preview.creation_timestamp).toLocaleDateString()}
          </code>
        </li>
        <li>
          Displayname:{" "}
          {preview.displayname ? (
            <code>{preview.displayname}</code>
          ) : (
            "None set"
          )}
        </li>
        <li>
          Purging messages:{" "}
          {preview.isPurgingMessages ? <code>Yes</code> : <code>No</code>}
        </li>
      </ul>
    </details>
  );
}

DraupnirInterfaceAdaptor.describeRenderer(SynapseAdminDeactivateCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
  confirmationPromptJSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    const preview = commandResult.ok;
    return Ok(
      <root>
        You are about to deactivate the user <code>{preview.targetUser}</code>.
        This will permanently deactivate the user and remove their access to the
        homeserver.
        {preview.isPurgingMessages ? (
          <span>
            Purging their messages will also cause their account to be used by
            the homeserver to send hundreds of redaction events to remove
            everything they have sent.
          </span>
        ) : (
          <fragment></fragment>
        )}
        {renderUserDetails(preview)}
      </root>
    );
  },
  JSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        Successfully deactivated <code>{commandResult.ok.targetUser}</code>
        {renderUserDetails(commandResult.ok)}
      </root>
    );
  },
});

function renderPromptDeactivation(
  targetUserID: StringUserID,
  policyRule: LiteralPolicyRule
): DocumentNode {
  return (
    <root>
      The resident user <code>{targetUserID}</code> has been matched by a policy
      rule that would cause their messages to be redacted if they joined a
      protected room. Would you like to deactivate this user account and remove
      all their messages?
      <ul>{renderRuleSummary(policyRule)}</ul>
    </root>
  );
}

// FIXME:
// hmm now would be a great time to include that feature where we can
// run commands. but there probably isn't time for that right now.
// we will just have to send a message, and then the confirmation prompt.
export function sendPromptDeactivation(
  targetUserID: StringUserID,
  policyRule: LiteralPolicyRule,
  managementRoomID: StringRoomID,
  sendConfirmationPrompt: ConfirmationPromptSender,
  log: Logger
): void {
  void Task(
    (async () => {
      const confirmationPromptResult = await sendConfirmationPrompt(
        {
          commandDesignator: ["draupnir", "deactivate"],
          readItems: [targetUserID, "--purge-messages"],
        },
        renderPromptDeactivation(targetUserID, policyRule),
        { roomID: managementRoomID }
      );
      if (isError(confirmationPromptResult)) {
        log.error(
          `Failed to send deactivation confirmation prompt for`,
          targetUserID,
          confirmationPromptResult
        );
      }
    })()
  );
}

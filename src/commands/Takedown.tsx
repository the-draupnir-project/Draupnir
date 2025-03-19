// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  BasicInvocationInformation,
  DeadDocumentJSX,
  describeCommand,
  DocumentNode,
  MatrixRoomIDPresentationType,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StringPresentationType,
  tuple,
  union,
} from "@the-draupnir-project/interface-manager";
import {
  DraupnirBanCommandContext,
  findPolicyRoomEditorFromRoomReference,
} from "./Ban";
import { isError, Ok, PolicyRuleType } from "matrix-protection-suite";
import { Result, ResultError } from "@gnuxie/typescript-result";
import {
  MatrixRoomID,
  MatrixUserID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";
import { renderRoomPill } from "./interface-manager/MatrixHelpRenderer";

export type TakedownPolicyPreview = {
  ruleType: PolicyRuleType;
  entity: string;
  policyRoom: MatrixRoomID;
};

export const DraupnirTakedownCommand = describeCommand({
  summary:
    "Mark an entity for takedown. This command is used to mark illegal or intollerable content as takedown. This is the strongest of consequences and is usualy irreversable.\
    This can be used to block rooms on your homeserver and discard spam invitations.",
  parameters: tuple(
    {
      name: "entity",
      description:
        "The entity to ban. This can be a user ID, room ID, or server name.",
      acceptor: union(
        MatrixUserIDPresentationType,
        MatrixRoomReferencePresentationSchema,
        StringPresentationType
      ),
    },
    {
      name: "list",
      acceptor: union(
        MatrixRoomReferencePresentationSchema,
        StringPresentationType
      ),
      prompt: async function ({
        policyRoomManager,
        clientUserID,
      }: DraupnirBanCommandContext) {
        return Ok({
          suggestions: policyRoomManager
            .getEditablePolicyRoomIDs(clientUserID, PolicyRuleType.User)
            .map((room) => MatrixRoomIDPresentationType.wrap(room)),
        });
      },
    }
  ),
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
    {
      watchedPolicyRooms,
      policyRoomManager,
      roomResolver,
    }: DraupnirBanCommandContext,
    _info: BasicInvocationInformation,
    keywords,
    _rest,
    entity,
    policyRoomDesignator
  ): Promise<Result<TakedownPolicyPreview | StringEventID>> {
    const policyRoomReference =
      typeof policyRoomDesignator === "string"
        ? Ok(
            watchedPolicyRooms.findPolicyRoomFromShortcode(policyRoomDesignator)
              ?.room
          )
        : Ok(policyRoomDesignator);
    if (isError(policyRoomReference)) {
      return policyRoomReference;
    }
    if (policyRoomReference.ok === undefined) {
      return ResultError.Result(
        `Unable to find a policy room from the shortcode ${policyRoomDesignator.toString()}`
      );
    }
    const policyRoomEditorResult = await findPolicyRoomEditorFromRoomReference(
      roomResolver,
      policyRoomManager,
      policyRoomReference.ok
    );
    if (isError(policyRoomEditorResult)) {
      return policyRoomEditorResult;
    }
    const policyRoomEditor = policyRoomEditorResult.ok;
    const preview = await (async () => {
      if (entity instanceof MatrixUserID) {
        return Ok({
          ruleType: PolicyRuleType.User,
          entity: entity.toString(),
          policyRoom: policyRoomEditor.room,
        });
      } else if (typeof entity === "string") {
        return Ok({
          ruleType: PolicyRuleType.Server,
          entity,
          policyRoom: policyRoomEditor.room,
        });
      } else {
        const resolvedRoomReference = await roomResolver.resolveRoom(entity);
        if (isError(resolvedRoomReference)) {
          return resolvedRoomReference;
        }
        return Ok({
          ruleType: PolicyRuleType.Room,
          entity: resolvedRoomReference.ok.toRoomIDOrAlias(),
          policyRoom: policyRoomEditor.room,
        });
      }
    })();
    if (isError(preview)) {
      return preview;
    }
    if (!keywords.getKeywordValue<boolean>("no-confirm", false)) {
      return preview;
    }
    // FIXME: we should inform the hash store about the entity right around here
    return await policyRoomEditor.takedownEntity(
      preview.ok.ruleType,
      preview.ok.entity,
      {}
    );
  },
});

function renderTakedownPreview(preview: TakedownPolicyPreview): DocumentNode {
  return (
    <fragment>
      You are about to mark an entity to be takendown by any means necessary:
      <ul>
        <li>
          entity: <code>{preview.entity}</code>
        </li>
        <li>
          policy type: <code>{preview.ruleType}</code>
        </li>
        <li>policy room: {renderRoomPill(preview.policyRoom)}</li>
      </ul>
      Please consider that doing so may have irreversable effects.
      <b>
        You MUST only use takedown policies to mark spam, illegal, or otherwise
        intolerable content. DO NOT takedown users who have committed a code of
        conduct violation.
      </b>
    </fragment>
  );
}

DraupnirInterfaceAdaptor.describeRenderer(DraupnirTakedownCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
  confirmationPromptJSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    } else if (typeof commandResult.ok === "string") {
      return Ok(undefined); // it's an event id that's got nothing going for it.
    } else {
      return Ok(<root>{renderTakedownPreview(commandResult.ok)}</root>);
    }
  },
});

DraupnirContextToCommandContextTranslator.registerTranslation(
  DraupnirTakedownCommand,
  function (draupnir) {
    return {
      policyRoomManager: draupnir.policyRoomManager,
      watchedPolicyRooms: draupnir.protectedRoomsSet.watchedPolicyRooms,
      defaultReasons: draupnir.config.commands.ban.defaultReasons,
      roomResolver: draupnir.clientPlatform.toRoomResolver(),
      clientUserID: draupnir.clientUserID,
    };
  }
);

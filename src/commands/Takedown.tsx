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
import { findPolicyRoomEditorFromRoomReference } from "./Ban";
import {
  isError,
  Logger,
  Ok,
  PolicyRoomManager,
  PolicyRuleType,
  RoomResolver,
  SHA256HashStore,
  Task,
  WatchedPolicyRooms,
} from "matrix-protection-suite";
import { Result, ResultError } from "@gnuxie/typescript-result";
import {
  MatrixRoomID,
  MatrixUserID,
  StringEventID,
  StringRoomID,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";
import { renderRoomPill } from "./interface-manager/MatrixHelpRenderer";
import { RoomDetailsProvider } from "../capabilities/RoomTakedownCapability";
import { SynapseAdminRoomDetailsProvider } from "../capabilities/SynapseAdminRoomTakedown/SynapseAdminRoomTakedown";

const log = new Logger("DraupnirTakedownCommand");

/**
 * Make sure that the hash store is up to date with the entity
 */
function handleRoomDiscovery(
  roomID: StringRoomID,
  store: SHA256HashStore | undefined,
  detailsProvider: RoomDetailsProvider | undefined
): void {
  if (store === undefined) {
    log.warn(
      "Unable to discover a room provided by the takedown command because the hash store has not been configured"
    );
    return;
  }
  if (detailsProvider === undefined) {
    log.warn(
      "Unable to discover a room provided by the takedown command because the details provider has not been configured"
    );
    return;
  }
  void Task(
    (async () => {
      const storeResult = await store.storeUndiscoveredRooms([roomID]);
      if (isError(storeResult)) {
        return storeResult.elaborate(
          "Unable to store the room from takedown command into the hash store"
        );
      }
      const detailsResult = await detailsProvider.getRoomDetails(roomID);
      if (isError(detailsResult)) {
        return detailsResult.elaborate(
          "Failed to fetch details for a room discovered via the takedown command"
        );
      }
      if (detailsResult.ok.creator === undefined) {
        log.warn(
          "No creator was provided in the details for the room, so we cannot store them",
          roomID,
          detailsResult.ok
        );
        return Ok(undefined);
      }
      return await store.storeRoomIdentification({
        roomID,
        creator: detailsResult.ok.creator,
        server: userServerName(detailsResult.ok.creator),
      });
    })()
  );
}

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
      }: DraupnirTakedownCommandContext) {
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
      "plain-text": {
        isFlag: true,
        description:
          "Creates a plain-text version of the policy rather than masking the entity with SHA256. There are not many reason to do this other than compatibility with other tools.",
      },
    },
  },
  async executor(
    {
      watchedPolicyRooms,
      policyRoomManager,
      roomResolver,
      hashStore,
      detailsProvider,
    }: DraupnirTakedownCommandContext,
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
    if (preview.ok.ruleType === PolicyRuleType.Room) {
      handleRoomDiscovery(
        preview.ok.entity as StringRoomID,
        hashStore,
        detailsProvider
      );
    }
    const plainText = keywords.getKeywordValue<boolean>("plain-text", false);
    return await policyRoomEditor.takedownEntity(
      preview.ok.ruleType,
      preview.ok.entity,
      { shouldHash: !plainText }
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

export type DraupnirTakedownCommandContext = {
  policyRoomManager: PolicyRoomManager;
  watchedPolicyRooms: WatchedPolicyRooms;
  defaultReasons: string[];
  roomResolver: RoomResolver;
  clientUserID: StringUserID;
  hashStore: SHA256HashStore | undefined;
  detailsProvider: RoomDetailsProvider | undefined;
};

DraupnirContextToCommandContextTranslator.registerTranslation(
  DraupnirTakedownCommand,
  function (draupnir) {
    return {
      policyRoomManager: draupnir.policyRoomManager,
      watchedPolicyRooms: draupnir.protectedRoomsSet.watchedPolicyRooms,
      defaultReasons: draupnir.config.commands.ban.defaultReasons,
      roomResolver: draupnir.clientPlatform.toRoomResolver(),
      clientUserID: draupnir.clientUserID,
      hashStore: draupnir.stores.hashStore,
      detailsProvider: draupnir.synapseAdminClient
        ? new SynapseAdminRoomDetailsProvider(draupnir.synapseAdminClient)
        : undefined,
    };
  }
);

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
import { findPolicyRoomEditorFromRoomReference } from "../Ban";
import {
  isError,
  Logger,
  Ok,
  PolicyRoomManager,
  PolicyRuleType,
  Protection,
  ProtectionDescription,
  RoomResolver,
  SHA256HashStore,
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
} from "../DraupnirCommandPrerequisites";
import { renderRoomPill } from "@the-draupnir-project/mps-interface-adaptor";
import { RoomDetailsProvider } from "../../capabilities/RoomTakedownCapability";
import { SynapseAdminRoomDetailsProvider } from "../../capabilities/SynapseAdminRoomTakedown/SynapseAdminRoomTakedown";
import { RoomTakedownProtection } from "../../protections/RoomTakedown/RoomTakedownProtection";
import { BlockInvitationsOnServerProtection } from "../../protections/BlockInvitationsOnServerProtection";
import { HomeserverUserPolicyProtection } from "../../protections/HomeserverUserPolicyApplication/HomeserverUserPolicyProtection";

const log = new Logger("DraupnirTakedownCommand");

const DownstreamTakedownProtectionNames = [
  RoomTakedownProtection.name,
  BlockInvitationsOnServerProtection.name,
  HomeserverUserPolicyProtection.name,
];

/**
 * Make sure that the hash store is up to date with the entity
 */
async function handleRoomDiscovery(
  roomID: StringRoomID,
  store: SHA256HashStore | undefined,
  detailsProvider: RoomDetailsProvider | undefined
): Promise<Result<void>> {
  if (store === undefined) {
    log.warn(
      "Unable to discover a room provided by the takedown command because the hash store has not been configured"
    );
    return Ok(undefined);
  }
  if (detailsProvider === undefined) {
    log.warn(
      "Unable to discover a room provided by the takedown command because the details provider has not been configured"
    );
    return Ok(undefined);
  }
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
}

export type TakedownPolicyPreview = {
  ruleType: PolicyRuleType;
  entity: string;
  policyRoom: MatrixRoomID;
  takedownProtections: {
    name: string;
    isEnabled: boolean;
  }[];
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
      enabledProtections,
    }: DraupnirTakedownCommandContext,
    _info: BasicInvocationInformation,
    keywords,
    _rest,
    entity,
    policyRoomDesignator
  ): Promise<Result<TakedownPolicyPreview | StringEventID>> {
    const enabledTakedownProtections = enabledProtections.filter((protection) =>
      DownstreamTakedownProtectionNames.includes(protection.description.name)
    );
    const takedownProtections = DownstreamTakedownProtectionNames.map(
      (name) => ({
        name,
        isEnabled: enabledTakedownProtections.some(
          (protection) => protection.description.name === name
        ),
      })
    );
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
          takedownProtections: takedownProtections,
        });
      } else if (typeof entity === "string") {
        return Ok({
          ruleType: PolicyRuleType.Server,
          entity,
          policyRoom: policyRoomEditor.room,
          takedownProtections: takedownProtections,
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
          takedownProtections: takedownProtections,
        });
      }
    })();
    if (isError(preview)) {
      return preview;
    }
    if (!keywords.getKeywordValue<boolean>("no-confirm", false)) {
      return preview;
    }

    const plainText = keywords.getKeywordValue<boolean>("plain-text", false);
    const takedownResult = await policyRoomEditor.takedownEntity(
      preview.ok.ruleType,
      preview.ok.entity,
      { shouldHash: !plainText }
    );
    if (
      isError(takedownResult) ||
      preview.ok.ruleType !== PolicyRuleType.Room
    ) {
      return takedownResult;
    }
    const roomDiscoveryResult = await handleRoomDiscovery(
      preview.ok.entity as StringRoomID,
      hashStore,
      detailsProvider
    );
    if (isError(roomDiscoveryResult)) {
      return roomDiscoveryResult.elaborate(
        "Failed to inform room discovery of the room provided in this command"
      );
    }
    return takedownResult;
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
      <h5>Please consider that doing so may have irreversable effects.</h5>
      <p>
        <b>
          You MUST only use takedown policies to mark spam, illegal, or
          otherwise intolerable content. DO NOT takedown users who have
          committed a code of conduct violation.
        </b>
      </p>
      <h5>The following protections consume takedown policies:</h5>
      <ul>
        {preview.takedownProtections.map((protection) => (
          <li>
            {protection.isEnabled ? "🟢 (enabled)" : "🔴 (disabled)"}
            <code>{protection.name}</code>
          </li>
        ))}
      </ul>
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
  enabledProtections: Protection<ProtectionDescription>[];
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
      enabledProtections: draupnir.protectedRoomsSet.protections.allProtections,
    };
  }
);

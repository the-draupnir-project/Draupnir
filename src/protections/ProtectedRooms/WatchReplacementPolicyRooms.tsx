// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DocumentNode } from "@the-draupnir-project/interface-manager";
import {
  Logger,
  PolicyRoomManager,
  PolicyRuleType,
  PowerLevelsEvent,
  PowerLevelsMirror,
  RoomCreateEvent,
  RoomEvent,
  RoomJoiner,
  RoomMessageSender,
  RoomStateManager,
  RoomStateRevision,
  RoomVersionMirror,
  StateChange,
  StateChangeType,
  Task,
  TombstoneEvent,
  Value,
  WatchedPolicyRoom,
  WatchedPolicyRooms,
} from "matrix-protection-suite";
import { renderPolicyList } from "../../commands/StatusCommand";
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import {
  MatrixRoomID,
  StringEventID,
  StringRoomID,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { isError, isOk, Ok, Result } from "@gnuxie/typescript-result";
import {
  MatrixReactionHandler,
  renderActionResultToEvent,
  renderMentionPill,
  sendMatrixEventsFromDeadDocument,
  renderErrorDetails,
} from "@the-draupnir-project/mps-interface-adaptor";
import { RoomReactionSender } from "matrix-protection-suite/dist/Client/RoomReactionSender";

const log = new Logger("WatchReplacementPolicyRooms");

const WatchReplacementPolicyRoomsPromptListenerName =
  "space.draupnir.watch_replacement_policy_rooms";

const WatchReplacementPolicyRoomsPromptReactionMap = {
  "Watch replacement only": "Watch replacement only",
  "Watch both": "Watch both",
  Cancel: "Cancel",
};

type WatchPolicyRoomPromptContext = {
  readonly replacement_room_id: StringRoomID;
  readonly original_room_id: StringRoomID;
  readonly tombstoneSender: StringUserID;
};

function renderPrivilegedUsers(revision: RoomStateRevision): DocumentNode {
  const powerLevels = revision.getStateEvent<PowerLevelsEvent>(
    "m.room.power_levels",
    ""
  );
  if (powerLevels === undefined) {
    throw new TypeError(
      "Mate can't find power levels within a room this is awful"
    );
  }
  const poweredUsers = powerLevels.content.users
    ? Object.entries(powerLevels.content.users)
        .filter(([userID]) =>
          PowerLevelsMirror.isUserAbleToSendEvent(
            userID as StringUserID,
            PolicyRuleType.User,
            powerLevels.content
          )
        )
        // Descending order.
        .sort(([_u1, a], [_u2, b]) => b - a)
    : [];
  const createEvent = revision.getStateEvent<RoomCreateEvent>(
    "m.room.create",
    ""
  );
  if (createEvent === undefined) {
    throw new TypeError("Mate can't find create event in the room");
  }
  const privilegedCreators = RoomVersionMirror.priviligedCreators(createEvent);
  return (
    <fragment>
      <details>
        <summary>
          Privileged users ({poweredUsers.length + privilegedCreators.length})
        </summary>
        <h6>Creators</h6>
        <ul>
          {privilegedCreators.map((creator) => (
            <li>{renderMentionPill(creator, creator)}</li>
          ))}
        </ul>
        <h6>Powered Users</h6>
        <ul>
          {" "}
          {poweredUsers.map(([poweredUser, powerLevel]) => (
            <li>
              {renderMentionPill(poweredUser, poweredUser)}:{" "}
              <code>{powerLevel}</code>
            </li>
          ))}
        </ul>
      </details>
    </fragment>
  );
}

function renderReplacementPrompt(
  originalWatchProfile: WatchedPolicyRoom,
  originalRoomStateRevision: RoomStateRevision,
  replacementWatchProfile: WatchedPolicyRoom,
  replacementRoomStateRevision: RoomStateRevision
): DocumentNode {
  return (
    <root>
      <h4>Policy room replaced</h4>
      The following policy room has been replaced, would you like Draupnir to
      watch the new policy room?
      <h5>Old room</h5>
      <ul>{renderPolicyList(originalWatchProfile)}</ul>
      {renderPrivilegedUsers(originalRoomStateRevision)}
      <h5>Replacement room</h5>
      <ul>{renderPolicyList(replacementWatchProfile)}</ul>
      {renderPrivilegedUsers(replacementRoomStateRevision)}
      <h4>Prompt</h4>
      Unfortunately we are unable to determine the policy list curator's intent
      with this upgrade, and whether or not they want you to still watch the old
      room.
    </root>
  );
}

async function sendPromptForReplacementRoom(
  roomMessageSender: RoomMessageSender,
  managementRoomID: StringRoomID,
  tombstoneSender: StringUserID,
  reactionHandler: MatrixReactionHandler,
  originalWatchProfile: WatchedPolicyRoom,
  originalRoomStateRevision: RoomStateRevision,
  replacementWatchProfile: WatchedPolicyRoom,
  replacementRoomStateRevision: RoomStateRevision
) {
  const reactionMap = new Map(
    Object.entries(WatchReplacementPolicyRoomsPromptReactionMap)
  );
  const sendResult = await sendMatrixEventsFromDeadDocument(
    roomMessageSender,
    managementRoomID,
    renderReplacementPrompt(
      originalWatchProfile,
      originalRoomStateRevision,
      replacementWatchProfile,
      replacementRoomStateRevision
    ),
    {
      additionalContent: reactionHandler.createAnnotation(
        WatchReplacementPolicyRoomsPromptListenerName,
        reactionMap,
        {
          tombstoneSender,
          original_room_id: originalWatchProfile.room.toRoomIDOrAlias(),
          replacement_room_id: replacementWatchProfile.room.toRoomIDOrAlias(),
        } satisfies WatchPolicyRoomPromptContext
      ),
    }
  );
  if (isError(sendResult)) {
    return sendResult;
  }
  return await reactionHandler.addReactionsToEvent(
    managementRoomID,
    sendResult.ok[0] as StringEventID,
    reactionMap
  );
}

/**
 * This class sends prompts to the management room to watch upgraded policy rooms.
 *
 * Lifecycle:
 * - `unregisterListeners` must be called to dispose.
 * - `handleRoomStateChange` must be called if you want it to detect active tombstones.
 * - `syncTombstonedPolicyRooms` must be called if you want it to detect stale tombstones at startup.
 */
export class WatchReplacementPolicyRooms {
  private readonly watchReplacementPolicyRoomsPromptListener =
    this.handlePromptReaction.bind(this);
  public constructor(
    private readonly managementRoomID: StringRoomID,
    private readonly roomJoiner: RoomJoiner,
    private readonly roomMessageSender: RoomMessageSender,
    private readonly roomReactionSender: RoomReactionSender,
    private readonly watchedPolicyRooms: WatchedPolicyRooms,
    private readonly roomStateManager: RoomStateManager,
    private readonly policyRoomManager: PolicyRoomManager,
    private readonly reactionHandler: MatrixReactionHandler
  ) {
    this.reactionHandler.addListener(
      WatchReplacementPolicyRoomsPromptListenerName,
      this.watchReplacementPolicyRoomsPromptListener
    );
  }

  handleRoomStateChange(changes: StateChange[]): void {
    for (const change of changes) {
      if (change.eventType !== "m.room.tombstone") {
        continue;
      }
      switch (change.changeType) {
        case StateChangeType.Introduced:
        case StateChangeType.PartiallyRedacted:
        case StateChangeType.Reintroduced:
        case StateChangeType.SupersededContent:
          break;
        default:
          continue;
      }
      if (Value.Check(TombstoneEvent, change.state)) {
        void this.handleTombstoneAndPhoneManagementRoom(change.state);
      }
    }
  }

  public async syncTombstonedPolicyRooms(): Promise<void> {
    for (const profile of this.watchedPolicyRooms.allRooms) {
      const roomStateRevision = (
        await this.roomStateManager.getRoomStateRevisionIssuer(profile.room)
      ).expect(
        "Should always be able to get the room state revision issuer for a watched policy room"
      ).currentRevision;
      const tombstoneEvent = roomStateRevision.getStateEvent<TombstoneEvent>(
        "m.room.tombstone",
        ""
      );
      if (
        tombstoneEvent === undefined ||
        tombstoneEvent.content.replacement_room === undefined
      ) {
        continue; // room hasn't been upgraded yet.
      }
      const replacementWatchProfile = this.watchedPolicyRooms.allRooms.find(
        (profile) =>
          profile.room.toRoomIDOrAlias() ===
          tombstoneEvent.content.replacement_room
      );
      if (replacementWatchProfile !== undefined) {
        continue; // room upgrade has been handled
        // TODO: in MSC4321 if the state is move then we should still send the prompt.
      }
      void this.handleTombstoneAndPhoneManagementRoom(tombstoneEvent);
    }
  }

  private async handleTombstoneAndPhoneManagementRoom(
    event: TombstoneEvent
  ): Promise<void> {
    const handleTombstoneResult = await this.handleTombstone(event);
    if (isOk(handleTombstoneResult)) {
      return;
    }
    const error = handleTombstoneResult.error;
    void Task(
      sendMatrixEventsFromDeadDocument(
        this.roomMessageSender,
        this.managementRoomID,
        <root>
          A policy room was replaced, but there was an error during the upgrade
          process.
          {renderErrorDetails(error)}
        </root>,
        {}
      ),
      { log }
    );
  }

  private async handleTombstone(event: TombstoneEvent): Promise<Result<void>> {
    const findWatchProfile = (roomID: StringRoomID) =>
      this.watchedPolicyRooms.allRooms.find(
        (profile) => profile.room.toRoomIDOrAlias() === roomID
      );
    const oldRoomWatchProfile = findWatchProfile(event.room_id);
    if (
      !oldRoomWatchProfile ||
      event.content.replacement_room === undefined ||
      // Make sure that we aren't already watching the replacement room.
      findWatchProfile(event.content.replacement_room)
    ) {
      return Ok(undefined); // already watching the replacement.
    }
    const originalRoomStateRevisionIssuer =
      await this.roomStateManager.getRoomStateRevisionIssuer(
        oldRoomWatchProfile.room
      );
    if (isError(originalRoomStateRevisionIssuer)) {
      return originalRoomStateRevisionIssuer.elaborate(
        "Unable to fetch room state revision for original policy room"
      );
    }
    const replacementRoom = new MatrixRoomID(event.content.replacement_room, [
      userServerName(event.sender),
    ]);
    const joinAttempt = await this.roomJoiner.joinRoom(replacementRoom);
    if (isError(joinAttempt)) {
      return joinAttempt.elaborate("Unable to join the replacement room");
    }
    const replacementRoomStateRevisionIssuer =
      await this.roomStateManager.getRoomStateRevisionIssuer(replacementRoom);
    if (isError(replacementRoomStateRevisionIssuer)) {
      return replacementRoomStateRevisionIssuer.elaborate(
        "Unable to fetch room state revision for an upgraded policy room"
      );
    }
    const policyRoomRevisionIssuer =
      await this.policyRoomManager.getPolicyRoomRevisionIssuer(replacementRoom);
    if (isError(policyRoomRevisionIssuer)) {
      return policyRoomRevisionIssuer.elaborate(
        "Unable to fetch a policy room revision for an upgraded policy room"
      );
    }
    const replacementRoomWatchProfile = {
      room: replacementRoom,
      propagation: oldRoomWatchProfile.propagation,
      revision: policyRoomRevisionIssuer.ok.currentRevision,
    } satisfies WatchedPolicyRoom;
    // Shouldn't this be a prompt to watch the new room?
    // Yes. it shouldn't happen automatically because it could be a hostile
    // takeover or something.
    const sendResult = await sendPromptForReplacementRoom(
      this.roomMessageSender,
      this.managementRoomID,
      event.sender,
      this.reactionHandler,
      oldRoomWatchProfile,
      originalRoomStateRevisionIssuer.ok.currentRevision,
      replacementRoomWatchProfile,
      replacementRoomStateRevisionIssuer.ok.currentRevision
    );
    if (isError(sendResult)) {
      return sendResult.elaborate(
        "Unable to send prompt to the management room"
      );
    }
    return Ok(undefined);
  }

  public async handlePromptReaction(
    key: string,
    item: unknown,
    context: WatchPolicyRoomPromptContext,
    _reactionMap: Map<string, unknown>,
    promptEvent: RoomEvent
  ): Promise<void> {
    const renderResultToPromptEvent = (result: Result<void>) => {
      renderActionResultToEvent(
        this.roomMessageSender,
        this.roomReactionSender,
        promptEvent,
        result
      );
      if (isOk(result)) {
        void Task(
          this.reactionHandler.completePrompt(
            promptEvent.room_id,
            promptEvent.event_id
          )
        );
      }
    };
    if (key === WatchReplacementPolicyRoomsPromptReactionMap.Cancel) {
      void Task(this.reactionHandler.cancelPrompt(promptEvent));
      return;
    }
    if (key === WatchReplacementPolicyRoomsPromptReactionMap["Watch both"]) {
      const watchReplacementPolicyRoomResult =
        await this.watchedPolicyRooms.watchPolicyRoomDirectly(
          new MatrixRoomID(context.replacement_room_id, [
            userServerName(context.tombstoneSender),
          ])
        );
      renderResultToPromptEvent(watchReplacementPolicyRoomResult);
      return;
    }
    if (
      key ===
      WatchReplacementPolicyRoomsPromptReactionMap["Watch replacement only"]
    ) {
      const watchReplacementPolicyRoomResult =
        await this.watchedPolicyRooms.watchPolicyRoomDirectly(
          new MatrixRoomID(context.replacement_room_id, [
            userServerName(context.tombstoneSender),
          ])
        );
      if (isError(watchReplacementPolicyRoomResult)) {
        renderResultToPromptEvent(watchReplacementPolicyRoomResult);
        return;
      }
      const unwatchOriginalPolicyRoomResult =
        await this.watchedPolicyRooms.unwatchPolicyRoom(
          new MatrixRoomID(context.original_room_id, [
            userServerName(context.tombstoneSender),
          ])
        );
      renderResultToPromptEvent(unwatchOriginalPolicyRoomResult);
      return;
    }
    log.error(
      "Could not handle the prompt to upgrade the room",
      context.original_room_id
    );
  }

  public unregisterListeners(): void {
    this.reactionHandler.removeListener(
      WatchReplacementPolicyRoomsPromptListenerName,
      this.watchReplacementPolicyRoomsPromptListener
    );
  }
}

// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  Ok,
  Revision,
  WatchedPolicyRoom,
  isError,
} from "matrix-protection-suite";
import {
  MatrixRoomID,
  MatrixRoomReference,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
  MatrixRoomReferencePresentationSchema,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { Result } from "@gnuxie/typescript-result";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";
import {
  groupWatchedPolicyRoomsByProtectionStatus,
  renderPolicyList,
} from "./StatusCommand";

type RoomListItem = {
  // used for room pill rendering
  room: MatrixRoomID;
  mostRecentRevision?: Revision;
};

type ListRoomsCommandInfo = {
  joinedAndProtectedLists: WatchedPolicyRoom[];
  joinedAndWatchedLists: WatchedPolicyRoom[];
  partedAndWatchedLists: WatchedPolicyRoom[];
  joinedAndProtectedRooms: RoomListItem[];
  joinedAndUnprotectedRooms: RoomListItem[];
  partedAndProtectedRooms: RoomListItem[];
};

export const DraupnirListProtectedRoomsCommand = describeCommand({
  summary: "List all of the protected rooms.",
  parameters: [],
  async executor(draupnir: Draupnir): Promise<Result<ListRoomsCommandInfo>> {
    const allJoinedRooms = draupnir.clientRooms.currentRevision.allJoinedRooms;
    const allProtectedRooms = draupnir.protectedRoomsSet.allProtectedRooms;
    const listInfo = groupWatchedPolicyRoomsByProtectionStatus(
      draupnir.protectedRoomsSet.watchedPolicyRooms,
      draupnir.clientRooms.currentRevision.allJoinedRooms,
      draupnir.protectedRoomsSet.allProtectedRooms
    );
    const makeRoomListItem = (room: MatrixRoomID) => {
      const revision = draupnir.protectedRoomsSet.setRoomState.getRevision(
        room.toRoomIDOrAlias()
      );
      if (revision) {
        return { room, mostRecentRevision: revision.revisionID };
      } else {
        return { room };
      }
    };
    return Ok({
      joinedAndProtectedLists: listInfo.subscribedAndProtectedLists,
      joinedAndWatchedLists: listInfo.subscribedLists,
      partedAndWatchedLists: listInfo.subscribedButPartedLists,
      joinedAndProtectedRooms: allProtectedRooms
        .filter((room) => allJoinedRooms.includes(room.toRoomIDOrAlias()))
        .map(makeRoomListItem),
      joinedAndUnprotectedRooms: allJoinedRooms
        .filter(
          (roomID) =>
            !allProtectedRooms.find((room) => room.toRoomIDOrAlias() === roomID)
        )
        .map((roomID) =>
          makeRoomListItem(MatrixRoomReference.fromRoomID(roomID))
        ),
      partedAndProtectedRooms: allProtectedRooms
        .filter((room) => !allJoinedRooms.includes(room.toRoomIDOrAlias()))
        .map(makeRoomListItem),
    });
  },
});

function renderPolicyLists(
  rooms: WatchedPolicyRoom[],
  options: { name: string }
): DocumentNode {
  if (rooms.length === 0) {
    return <fragment></fragment>;
  }
  return (
    <details>
      <summary>
        {options.name} ({rooms.length}):
      </summary>
      <ul>{rooms.map(renderPolicyList)}</ul>
    </details>
  );
}

function renderRoomList(
  rooms: RoomListItem[],
  options: { name: string }
): DocumentNode {
  if (rooms.length === 0) {
    return <fragment></fragment>;
  }
  return (
    <details>
      <summary>
        {options.name} ({rooms.length}):
      </summary>
      <ul>
        {rooms.map((item) => (
          <li>
            <a href={item.room.toPermalink()}>{item.room.toRoomIDOrAlias()}</a>{" "}
            {"mostRecentRevision" in item ? (
              <fragment>
                (last update:{" "}
                <code>
                  {new Date(item.mostRecentRevision.time).toLocaleString()}
                </code>
                )
              </fragment>
            ) : (
              <fragment></fragment>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

DraupnirInterfaceAdaptor.describeRenderer(DraupnirListProtectedRoomsCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        {result.ok.joinedAndProtectedRooms.length === 0 ? (
          <b>There are no joined and protected rooms.</b>
        ) : (
          <fragment></fragment>
        )}
        {renderPolicyLists(result.ok.joinedAndProtectedLists, {
          name: "Joined and protected policy rooms",
        })}
        {renderPolicyLists(result.ok.joinedAndWatchedLists, {
          name: "Joined and watched unprotected policy rooms",
        })}
        {renderPolicyLists(result.ok.partedAndWatchedLists, {
          name: "Parted policy rooms that are still marked as watched",
        })}
        {renderRoomList(result.ok.joinedAndProtectedRooms, {
          name: "Protected rooms",
        })}
        {renderRoomList(result.ok.joinedAndUnprotectedRooms, {
          name: "Joined, but unprotected rooms",
        })}
        {renderRoomList(result.ok.partedAndProtectedRooms, {
          name: "Parted rooms that are still marked as protected",
        })}
      </root>
    );
  },
});

export const DraupnirRoomsAddCommand = describeCommand({
  summary:
    "Protect the room using the watched policy lists, banning users and synchronizing server ACL.",
  parameters: tuple({
    name: "room",
    acceptor: MatrixRoomReferencePresentationSchema,
    description: "The room for Draupnir to protect.",
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    roomRef: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const joiner = draupnir.clientPlatform.toRoomJoiner();
    const room = await joiner.joinRoom(roomRef);
    if (isError(room)) {
      return room.elaborate(
        `The homeserver that Draupnir is hosted on cannot join this room using the room reference provided.\
                Try an alias or the "share room" button in your client to obtain a valid reference to the room.`
      );
    }
    return await draupnir.protectedRoomsSet.protectedRoomsManager.addRoom(
      room.ok
    );
  },
});

export const DraupnirRoomsRemoveCommand = describeCommand({
  summary: "Stop protecting the room and leave.",
  parameters: tuple({
    name: "room",
    acceptor: MatrixRoomReferencePresentationSchema,
    description: "The room to stop protecting.",
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    roomRef: MatrixRoomReference
  ): Promise<ActionResult<void>> {
    const room = await draupnir.clientPlatform
      .toRoomResolver()
      .resolveRoom(roomRef);
    if (isError(room)) {
      return room.elaborate(
        `The homeserver that Draupnir is hosted on cannot join this room using the room reference provided.\
                Try an alias or the "share room" button in your client to obtain a valid reference to the room.`
      );
    }
    const removeResult =
      await draupnir.protectedRoomsSet.protectedRoomsManager.removeRoom(
        room.ok
      );
    if (isError(removeResult)) {
      return removeResult;
    }
    try {
      await draupnir.client.leaveRoom(room.ok.toRoomIDOrAlias());
    } catch (exception) {
      return ActionException.Result(
        `Failed to leave ${roomRef.toPermalink()} - the room is no longer being protected, but the bot could not leave.`,
        { exceptionKind: ActionExceptionKind.Unknown, exception }
      );
    }
    return Ok(undefined);
  },
});

for (const command of [DraupnirRoomsAddCommand, DraupnirRoomsRemoveCommand]) {
  DraupnirInterfaceAdaptor.describeRenderer(command, {
    isAlwaysSupposedToUseDefaultRenderer: true,
  });
}

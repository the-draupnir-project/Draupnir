// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { DOCUMENTATION_URL, PACKAGE_JSON, SOFTWARE_VERSION } from "../config";
import {
  ActionResult,
  Ok,
  PolicyRuleType,
  WatchedPolicyRoom,
  WatchedPolicyRooms,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  DeadDocumentJSX,
  DocumentNode,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";
import {
  MatrixRoomID,
  MatrixRoomReference,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomTakedownProtection } from "../protections/RoomTakedown/RoomTakedownProtection";
import { renderRoomPill } from "../commands/interface-manager/MatrixHelpRenderer";

export const DraupnirStatusCommand = describeCommand({
  summary: "Show the status of the bot.",
  parameters: [],
  async executor(draupnir: Draupnir): Promise<ActionResult<StatusInfo>> {
    return Ok(draupnirStatusInfo(draupnir));
  },
});

export type WatchedPolicyRoomsInfo = {
  subscribedLists: WatchedPolicyRoom[];
  subscribedAndProtectedLists: WatchedPolicyRoom[];
  subscribedButPartedLists: WatchedPolicyRoom[];
};

export type StatusInfo = {
  numberOfProtectedRooms: number;
  numberOfUniqueMembers: number;
  version: string;
  repository: string;
  documentationURL: string;
} & DraupnirNotificationRoomsInfo &
  WatchedPolicyRoomsInfo;

export function groupWatchedPolicyRoomsByProtectionStatus(
  watchedPolicyRooms: WatchedPolicyRooms,
  allJoinedRooms: StringRoomID[],
  protectedRooms: MatrixRoomID[]
): WatchedPolicyRoomsInfo {
  const watchedListProfiles = watchedPolicyRooms.allRooms;
  const subscribedAndProtectedLists = watchedListProfiles.filter(
    (profile) =>
      allJoinedRooms.includes(profile.room.toRoomIDOrAlias()) &&
      protectedRooms.find(
        (protectedRoom) =>
          protectedRoom.toRoomIDOrAlias() === profile.room.toRoomIDOrAlias()
      )
  );
  const subscribedLists = watchedListProfiles.filter(
    (profile) =>
      allJoinedRooms.includes(profile.room.toRoomIDOrAlias()) &&
      !protectedRooms.find(
        (protectedRoom) =>
          protectedRoom.toRoomIDOrAlias() === profile.room.toRoomIDOrAlias()
      )
  );
  const subscribedButPartedLists = watchedListProfiles.filter(
    (profile) => !allJoinedRooms.includes(profile.room.toRoomIDOrAlias())
  );
  return {
    subscribedLists: subscribedLists,
    subscribedAndProtectedLists: subscribedAndProtectedLists,
    subscribedButPartedLists,
  };
}

DraupnirInterfaceAdaptor.describeRenderer(DraupnirStatusCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    return Ok(renderStatusInfo(result.ok));
  },
});

type DraupnirNotificationRoomsInfo = {
  readonly roomDiscoveryNotificationRoomID: StringRoomID | undefined;
};

function extractProtectionNotificationRooms(
  draupnir: Draupnir
): DraupnirNotificationRoomsInfo {
  return {
    roomDiscoveryNotificationRoomID: (
      draupnir.protectedRoomsSet.protections.findEnabledProtection(
        RoomTakedownProtection.name
      ) as RoomTakedownProtection | undefined
    )?.discoveryNotificationRoom,
  };
}

// FIXME: need a shoutout to dependencies in here and NOTICE info.
export function draupnirStatusInfo(draupnir: Draupnir): StatusInfo {
  const watchedListInfo = groupWatchedPolicyRoomsByProtectionStatus(
    draupnir.protectedRoomsSet.watchedPolicyRooms,
    draupnir.clientRooms.currentRevision.allJoinedRooms,
    draupnir.protectedRoomsSet.allProtectedRooms
  );
  return {
    numberOfProtectedRooms: draupnir.protectedRoomsSet.allProtectedRooms.length,
    numberOfUniqueMembers:
      draupnir.protectedRoomsSet.setMembership.currentRevision.uniqueMemberCount(),
    subscribedLists: watchedListInfo.subscribedLists,
    subscribedAndProtectedLists: watchedListInfo.subscribedAndProtectedLists,
    subscribedButPartedLists: watchedListInfo.subscribedButPartedLists,
    documentationURL: DOCUMENTATION_URL,
    version: SOFTWARE_VERSION,
    repository: PACKAGE_JSON["repository"] ?? "Unknown",
    ...extractProtectionNotificationRooms(draupnir),
  };
}

export function renderPolicyList(list: WatchedPolicyRoom): DocumentNode {
  return (
    <li>
      <a href={list.revision.room.toPermalink()}>
        {list.revision.room.toRoomIDOrAlias()}
      </a>{" "}
      &#32; ({list.revision.shortcode ?? "<no shortcode>"}) propagation:{" "}
      {list.propagation} &#32; (rules:{" "}
      {list.revision.allRulesOfType(PolicyRuleType.Server).length} servers,{" "}
      {list.revision.allRulesOfType(PolicyRuleType.User).length} users,{" "}
      {list.revision.allRulesOfType(PolicyRuleType.Room).length} rooms) (last
      update:{" "}
      <code>{new Date(list.revision.revisionID.time).toLocaleString()}</code>)
    </li>
  );
}

function renderNotificationRooms(info: StatusInfo): DocumentNode {
  if (info.roomDiscoveryNotificationRoomID === undefined) {
    return <fragment></fragment>;
  }
  const renderNotificationRoom = (
    name: string,
    roomID: StringRoomID | undefined
  ) => {
    if (roomID === undefined) {
      return <fragment></fragment>;
    }
    return (
      <li>
        {name}: {renderRoomPill(MatrixRoomReference.fromRoomID(roomID))}
      </li>
    );
  };
  return (
    <fragment>
      <b>Notification rooms:</b>
      <br />
      <ul>
        {renderNotificationRoom(
          "Room discovery",
          info.roomDiscoveryNotificationRoomID
        )}
      </ul>
    </fragment>
  );
}

export function renderStatusInfo(info: StatusInfo): DocumentNode {
  const renderPolicyLists = (header: string, lists: WatchedPolicyRoom[]) => {
    const renderedLists = lists.map(renderPolicyList);
    return (
      <fragment>
        <b>{header}</b>
        <br />
        <ul>
          {renderedLists.length === 0 ? (
            <li>
              <i>None</i>
            </li>
          ) : (
            renderedLists
          )}
        </ul>
      </fragment>
    );
  };
  return (
    <root>
      <b>Protected Rooms: </b>
      {info.numberOfProtectedRooms}
      <br />
      <b>Protected Users: </b>
      {info.numberOfUniqueMembers}
      <br />
      {renderPolicyLists("Subscribed policy rooms", info.subscribedLists)}
      {renderPolicyLists(
        "Subscribed and protected policy rooms",
        info.subscribedAndProtectedLists
      )}
      {renderNotificationRooms(info)}
      <b>Version: </b>
      <code>{info.version}</code>
      <br />
      <b>Repository: </b>
      <code>{info.repository}</code>
      <br />
      <b>Documentation: </b>{" "}
      <a href={info.documentationURL}>{info.documentationURL}</a>
      <br />
    </root>
  );
}

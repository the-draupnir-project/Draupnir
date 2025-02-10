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
  PolicyListConfig,
  PolicyRoomManager,
  PolicyRoomRevision,
  PolicyRoomWatchProfile,
  PolicyRuleType,
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
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { Result } from "@gnuxie/typescript-result";

export const DraupnirStatusCommand = describeCommand({
  summary: "Show the status of the bot.",
  parameters: [],
  async executor(draupnir: Draupnir): Promise<ActionResult<StatusInfo>> {
    return await draupnirStatusInfo(draupnir);
  },
});

export interface WatchedPolicyRoomInfo {
  watchedListProfile: PolicyRoomWatchProfile;
  revision: PolicyRoomRevision;
}

export type WatchedPolicyRoomsInfo = {
  subscribedLists: WatchedPolicyRoomInfo[];
  subscribedAndProtectedLists: WatchedPolicyRoomInfo[];
  subscribedButPartedLists: PolicyRoomWatchProfile[];
};

export type StatusInfo = {
  numberOfProtectedRooms: number;
  numberOfUniqueMembers: number;
  version: string;
  repository: string;
  documentationURL: string;
} & WatchedPolicyRoomsInfo;

async function findRevisionIssuers(
  policyRoomManager: PolicyRoomManager,
  profiles: PolicyRoomWatchProfile[]
): Promise<Result<WatchedPolicyRoomInfo[]>> {
  const issuers: WatchedPolicyRoomInfo[] = [];
  for (const profile of profiles) {
    const issuerResult = await policyRoomManager.getPolicyRoomRevisionIssuer(
      profile.room
    );
    if (isError(issuerResult)) {
      return issuerResult.elaborate(
        "Unable to find a policy room revision issuer for a watched policy list"
      );
    }
    issuers.push({
      watchedListProfile: profile,
      revision: issuerResult.ok.currentRevision,
    });
  }
  return Ok(issuers);
}

export async function getWatchedPolicyRoomsInfo(
  issuerManager: PolicyListConfig,
  policyRoomManager: PolicyRoomManager,
  allJoinedRooms: StringRoomID[],
  protectedRooms: MatrixRoomID[]
): Promise<Result<WatchedPolicyRoomsInfo>> {
  const watchedListProfiles = issuerManager.allWatchedLists;
  const subscribedAndProtectedLists = await findRevisionIssuers(
    policyRoomManager,
    watchedListProfiles.filter(
      (profile) =>
        allJoinedRooms.includes(profile.room.toRoomIDOrAlias()) &&
        protectedRooms.find(
          (protectedRoom) =>
            protectedRoom.toRoomIDOrAlias() === profile.room.toRoomIDOrAlias()
        )
    )
  );
  if (isError(subscribedAndProtectedLists)) {
    return subscribedAndProtectedLists;
  }
  const subscribedLists = await findRevisionIssuers(
    policyRoomManager,
    watchedListProfiles.filter(
      (profile) =>
        allJoinedRooms.includes(profile.room.toRoomIDOrAlias()) &&
        !protectedRooms.find(
          (protectedRoom) =>
            protectedRoom.toRoomIDOrAlias() === profile.room.toRoomIDOrAlias()
        )
    )
  );
  if (isError(subscribedLists)) {
    return subscribedLists;
  }
  const subscribedButPartedLists = watchedListProfiles.filter(
    (profile) => !allJoinedRooms.includes(profile.room.toRoomIDOrAlias())
  );
  return Ok({
    subscribedLists: subscribedLists.ok,
    subscribedAndProtectedLists: subscribedAndProtectedLists.ok,
    subscribedButPartedLists,
  });
}

DraupnirInterfaceAdaptor.describeRenderer(DraupnirStatusCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    return Ok(renderStatusInfo(result.ok));
  },
});

// FIXME: need a shoutout to dependencies in here and NOTICE info.
export async function draupnirStatusInfo(
  draupnir: Draupnir
): Promise<Result<StatusInfo>> {
  const watchedListInfo = await getWatchedPolicyRoomsInfo(
    draupnir.protectedRoomsSet.issuerManager,
    draupnir.policyRoomManager,
    draupnir.clientRooms.currentRevision.allJoinedRooms,
    draupnir.protectedRoomsSet.allProtectedRooms
  );
  if (isError(watchedListInfo)) {
    return watchedListInfo;
  }
  return Ok({
    numberOfProtectedRooms: draupnir.protectedRoomsSet.allProtectedRooms.length,
    numberOfUniqueMembers:
      draupnir.protectedRoomsSet.setMembership.currentRevision.uniqueMemberCount(),
    subscribedLists: watchedListInfo.ok.subscribedLists,
    subscribedAndProtectedLists: watchedListInfo.ok.subscribedAndProtectedLists,
    subscribedButPartedLists: watchedListInfo.ok.subscribedButPartedLists,
    documentationURL: DOCUMENTATION_URL,
    version: SOFTWARE_VERSION,
    repository: PACKAGE_JSON["repository"] ?? "Unknown",
  });
}

export function renderPolicyList(list: WatchedPolicyRoomInfo): DocumentNode {
  return (
    <li>
      <a href={list.revision.room.toPermalink()}>
        {list.revision.room.toRoomIDOrAlias()}
      </a>{" "}
      &#32; ({list.revision.shortcode ?? "<no shortcode>"}) propagation:{" "}
      {list.watchedListProfile.propagation} &#32; (rules:{" "}
      {list.revision.allRulesOfType(PolicyRuleType.Server).length} servers,{" "}
      {list.revision.allRulesOfType(PolicyRuleType.User).length} users,{" "}
      {list.revision.allRulesOfType(PolicyRuleType.Room).length} rooms) (last
      update:{" "}
      <code>{new Date(list.revision.revisionID.time).toLocaleString()}</code>)
    </li>
  );
}

export function renderStatusInfo(info: StatusInfo): DocumentNode {
  const renderPolicyLists = (
    header: string,
    lists: WatchedPolicyRoomInfo[]
  ) => {
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

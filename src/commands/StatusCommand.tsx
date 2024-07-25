// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
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
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import { parameters } from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { DeadDocumentJSX } from "./interface-manager/JSXFactory";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { renderMatrixAndSend } from "./interface-manager/DeadDocumentMatrix";
import {
  ActionResult,
  Ok,
  PolicyRoomRevision,
  PolicyRoomWatchProfile,
  PolicyRuleType,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { DocumentNode } from "./interface-manager/DeadDocument";

defineInterfaceCommand({
  designator: ["status"],
  table: "draupnir",
  parameters: parameters([]),
  command: async function (
    this: DraupnirContext
  ): Promise<ActionResult<StatusInfo>> {
    return Ok(await draupnirStatusInfo(this.draupnir));
  },
  summary: "Show the status of the bot.",
});

export interface ListInfo {
  watchedListProfile: PolicyRoomWatchProfile;
  revision: PolicyRoomRevision;
}

export interface StatusInfo {
  numberOfProtectedRooms: number;
  subscribedLists: ListInfo[];
  subscribedAndProtectedLists: ListInfo[];
  version: string;
  repository: string;
  documentationURL: string;
}

export async function listInfo(draupnir: Draupnir): Promise<ListInfo[]> {
  const watchedListProfiles =
    draupnir.protectedRoomsSet.issuerManager.allWatchedLists;
  const issuerResults = await Promise.all(
    watchedListProfiles.map((profile) =>
      draupnir.policyRoomManager.getPolicyRoomRevisionIssuer(profile.room)
    )
  );
  return issuerResults.map((result) => {
    if (isError(result)) {
      throw result.error;
    }
    const revision = result.ok.currentRevision;
    const associatedProfile = watchedListProfiles.find(
      (profile) =>
        profile.room.toRoomIDOrAlias() === revision.room.toRoomIDOrAlias()
    );
    if (associatedProfile === undefined) {
      throw new TypeError(
        `Shouldn't be possible to have got a result for a list profile we don't have`
      );
    }
    return {
      watchedListProfile: associatedProfile,
      revision: revision,
    };
  });
}

// FIXME: need a shoutout to dependencies in here and NOTICE info.
export async function draupnirStatusInfo(
  draupnir: Draupnir
): Promise<StatusInfo> {
  const watchedListInfo = await listInfo(draupnir);
  const protectedWatchedLists = watchedListInfo.filter((info) =>
    draupnir.protectedRoomsSet.isProtectedRoom(
      info.revision.room.toRoomIDOrAlias()
    )
  );
  const unprotectedListProfiles = watchedListInfo.filter(
    (info) =>
      !draupnir.protectedRoomsSet.isProtectedRoom(
        info.revision.room.toRoomIDOrAlias()
      )
  );
  return {
    numberOfProtectedRooms: draupnir.protectedRoomsSet.allProtectedRooms.length,
    subscribedLists: unprotectedListProfiles,
    subscribedAndProtectedLists: protectedWatchedLists,
    documentationURL: DOCUMENTATION_URL,
    version: SOFTWARE_VERSION,
    repository: PACKAGE_JSON["repository"] ?? "Unknown",
  };
}

export function renderStatusInfo(info: StatusInfo): DocumentNode {
  const renderPolicyLists = (header: string, lists: ListInfo[]) => {
    const renderedLists = lists.map((list) => {
      return (
        <li>
          <a href={list.revision.room.toPermalink()}>
            {list.revision.room.toRoomIDOrAlias()}
          </a>{" "}
          &#32; ({list.revision.shortcode ?? "<no shortcode>"}) propagation:{" "}
          {list.watchedListProfile.propagation} &#32; (rules:{" "}
          {list.revision.allRulesOfType(PolicyRuleType.Server).length} servers,{" "}
          {list.revision.allRulesOfType(PolicyRuleType.User).length} users,{" "}
          {list.revision.allRulesOfType(PolicyRuleType.Room).length} rooms)
        </li>
      );
    });
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

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "status"),
  renderer: async function (
    this,
    client,
    commandRoomID,
    event,
    result: ActionResult<StatusInfo>
  ): Promise<void> {
    if (isError(result)) {
      await tickCrossRenderer.call(this, client, commandRoomID, event, result);
      return;
    }
    const info = result.ok;
    await renderMatrixAndSend(
      renderStatusInfo(info),
      commandRoomID,
      event,
      client
    );
  },
});

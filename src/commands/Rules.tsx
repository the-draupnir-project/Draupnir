// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  Ok,
  PolicyRoomWatchProfile,
  PolicyRule,
  isError,
} from "matrix-protection-suite";
import { listInfo } from "./StatusCommand";
import {
  StringRoomID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StringPresentationType,
  describeCommand,
  tuple,
  union,
} from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";
import { Draupnir } from "../Draupnir";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

function renderListMatches(
  result: Result<ListMatches[]>
): Result<DocumentNode | undefined> {
  if (isError(result)) {
    return Ok(undefined);
  }
  const lists = result.ok;
  if (lists.length === 0) {
    return Ok(<root>No policy lists configured</root>);
  }
  return Ok(
    <root>
      <b>Rules currently in use:</b>
      <br />
      {lists.map((list) => renderListRules(list))}
    </root>
  );
}

export function renderListRules(list: ListMatches) {
  const renderRuleSummary = (rule: PolicyRule) => {
    return (
      <li>
        {rule.kind} (<code>{rule.recommendation}</code>):{" "}
        <code>{rule.entity}</code> ({rule.reason})
      </li>
    );
  };
  return (
    <fragment>
      <a href={list.room.toPermalink()}>{list.roomID}</a> propagation:{" "}
      <code>{list.profile.propagation}</code>
      <br />
      <ul>
        {list.matches.length === 0 ? (
          <li>
            <i>No rules</i>
          </li>
        ) : (
          list.matches.map((rule) => renderRuleSummary(rule))
        )}
      </ul>
    </fragment>
  );
}

export interface ListMatches {
  room: MatrixRoomID;
  roomID: StringRoomID;
  profile: PolicyRoomWatchProfile;
  matches: PolicyRule[];
}

export const DraupnirListRulesCommand = describeCommand({
  summary: "Lists the rules currently in use by Draupnir.",
  parameters: [],
  async executor(draupnir: Draupnir): Promise<Result<ListMatches[]>> {
    const infoResult = await listInfo(draupnir);
    return Ok(
      infoResult.map((policyRoom) => ({
        room: policyRoom.revision.room,
        roomID: policyRoom.revision.room.toRoomIDOrAlias(),
        profile: policyRoom.watchedListProfile,
        matches: policyRoom.revision.allRules(),
      }))
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirListRulesCommand, {
  JSXRenderer: renderListMatches,
});

export const DraupnirRulesMatchingCommand = describeCommand({
  summary:
    "Lists the rules in use that will match this entity e.g. `!rules matching @foo:example.com` will show all the user and server rules, including globs, that match this user",
  parameters: tuple({
    name: "entity",
    acceptor: union(
      MatrixUserIDPresentationType,
      MatrixRoomReferencePresentationSchema,
      StringPresentationType
    ),
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    entity
  ): Promise<Result<ListMatches[]>> {
    const policyRooms = await listInfo(draupnir);
    return Ok(
      policyRooms.map((policyRoom) => {
        return {
          room: policyRoom.revision.room,
          roomID: policyRoom.revision.room.toRoomIDOrAlias(),
          matches: policyRoom.revision.allRulesMatchingEntity(
            entity.toString()
          ),
          profile: policyRoom.watchedListProfile,
        };
      })
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirRulesMatchingCommand, {
  JSXRenderer: renderListMatches,
});

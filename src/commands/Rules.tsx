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
  GlobPolicyRule,
  HashedLiteralPolicyRule,
  LiteralPolicyRule,
  MemberPolicyMatches,
  Ok,
  PolicyRoomWatchProfile,
  PolicyRule,
  PolicyRuleMatchType,
  isError,
} from "matrix-protection-suite";
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
import { renderMentionPill } from "./interface-manager/MatrixHelpRenderer";

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

export function renderRuleHashes(rule: HashedLiteralPolicyRule): DocumentNode {
  return (
    <ul>
      {Object.entries(rule.hashes).map(([algorithm, hash]) => (
        <li>
          <code>{algorithm}</code>: <code>{hash}</code>
        </li>
      ))}
    </ul>
  );
}

export function renderRuleClearText(
  rule: LiteralPolicyRule | GlobPolicyRule
): DocumentNode {
  return (
    <fragment>
      <code>{rule.entity}</code> ({rule.reason ?? "<no reason supplied>"})
    </fragment>
  );
}

function renderRuleSummary(rule: PolicyRule) {
  return (
    <li>
      {rule.kind} (<code>{rule.recommendation}</code>):{" "}
      {rule.matchType === PolicyRuleMatchType.HashedLiteral
        ? renderRuleHashes(rule)
        : renderRuleClearText(rule)}
    </li>
  );
}

export function renderListRules(list: ListMatches) {
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
    return Ok(
      draupnir.protectedRoomsSet.watchedPolicyRooms.allRooms.map((profile) => ({
        room: profile.revision.room,
        roomID: profile.revision.room.toRoomIDOrAlias(),
        profile: profile,
        matches: profile.revision.allRules(),
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
    return Ok(
      draupnir.protectedRoomsSet.watchedPolicyRooms.allRooms.map((profile) => {
        return {
          room: profile.revision.room,
          roomID: profile.revision.room.toRoomIDOrAlias(),
          matches: profile.revision.allRulesMatchingEntity(
            entity.toString(),
            {}
          ),
          profile: profile,
        };
      })
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirRulesMatchingCommand, {
  JSXRenderer: renderListMatches,
});

export const DraupnirRulesMatchingMembersCommand = describeCommand({
  summary:
    "Lists the rule that are matching matching members of protected rooms",
  parameters: tuple(),
  async executor(draupnir: Draupnir): Promise<Result<MemberPolicyMatches[]>> {
    const revision =
      draupnir.protectedRoomsSet.setPoliciesMatchingMembership.currentRevision;
    return Ok(revision.allMembersWithRules());
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirRulesMatchingMembersCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        <h4>Rules matching members of protected rooms:</h4>
        <ul>
          {result.ok.map((memberPolicies) => (
            <li>
              {renderMentionPill(memberPolicies.userID, memberPolicies.userID)}:
              <ul>
                {memberPolicies.policies.map((policy) =>
                  renderRuleSummary(policy)
                )}
              </ul>
            </li>
          ))}
        </ul>
      </root>
    );
  },
});

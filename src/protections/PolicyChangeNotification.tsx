// SPDX-FileCopyrightText: 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// SPDX-FileCopyrightText: 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  AbstractProtection,
  ActionResult,
  Logger,
  Ok,
  PolicyListRevision,
  PolicyRoomManager,
  PolicyRoomRevisionIssuer,
  PolicyRuleChange,
  ProtectedRoomsSet,
  ProtectionDescription,
  UnknownConfig,
  describeProtection,
  isError,
} from "matrix-protection-suite";
import { DraupnirProtection } from "./Protection";
import { Draupnir } from "../Draupnir";
import {
  renderMentionPill,
  renderRoomPill,
} from "../commands/interface-manager/MatrixHelpRenderer";
import {
  StringRoomID,
  MatrixRoomReference,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { sendMatrixEventsFromDeadDocument } from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";

const log = new Logger("PolicyChangeNotification");

export type PolicyChangeNotificationCapabilitites = Record<never, never>;

export type PolicyChangeNotificationProtectionDescription =
  ProtectionDescription<
    Draupnir,
    UnknownConfig,
    PolicyChangeNotificationCapabilitites
  >;

type ChangesByRoomID = Map<StringRoomID, PolicyRuleChange[]>;

export class PolicyChangeNotification
  extends AbstractProtection<PolicyChangeNotificationProtectionDescription>
  implements DraupnirProtection<PolicyChangeNotificationProtectionDescription>
{
  constructor(
    description: PolicyChangeNotificationProtectionDescription,
    capabilities: PolicyChangeNotificationCapabilitites,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
  }

  public async handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<ActionResult<void>> {
    if (changes.length === 0) {
      return Ok(undefined);
    }
    const changesByList: ChangesByRoomID = new Map();
    for (const change of changes) {
      const entry = changesByList.get(change.event.room_id);
      if (entry === undefined) {
        changesByList.set(change.event.room_id, [change]);
      } else {
        entry.push(change);
      }
    }
    const groupedChanges = await groupRulesByIssuer(
      this.draupnir.policyRoomManager,
      changesByList
    );
    if (isError(groupedChanges)) {
      return groupedChanges;
    }
    const sendResult = await sendMatrixEventsFromDeadDocument(
      this.draupnir.clientPlatform.toRoomMessageSender(),
      this.draupnir.managementRoomID,
      <root>{renderGroupedChanges(groupedChanges.ok)}</root>,
      {}
    );
    if (isError(sendResult)) {
      log.error(`couldn't send change to management room`, sendResult.error);
    }
    return Ok(undefined);
  }
}

type GroupedChange = {
  issuer: PolicyRoomRevisionIssuer;
  changes: PolicyRuleChange[];
};

async function groupRulesByIssuer(
  policyRoomManager: PolicyRoomManager,
  changesByList: ChangesByRoomID
): Promise<ActionResult<GroupedChange[]>> {
  const groupedChanges: GroupedChange[] = [];
  for (const [roomID, changes] of changesByList) {
    const issuer = await policyRoomManager.getPolicyRoomRevisionIssuer(
      MatrixRoomReference.fromRoomID(roomID)
    );
    if (isError(issuer)) {
      return issuer;
    } else {
      groupedChanges.push({
        issuer: issuer.ok,
        changes: changes,
      });
    }
  }
  return Ok(groupedChanges);
}

function renderListChange(change: PolicyRuleChange): DocumentNode {
  return (
    <fragment>
      <li>
        {renderMentionPill(change.sender, change.sender)}{" "}
        <code>{change.changeType}</code> &#32;
        {change.rule.kind} (<code>{change.rule.recommendation}</code>) &#32;
        <code>{change.rule.entity}</code> ({change.rule.reason})
      </li>
    </fragment>
  );
}

function renderListChanges({ issuer, changes }: GroupedChange): DocumentNode {
  return (
    <fragment>
      {renderRoomPill(issuer.room)} (shortcode:{" "}
      {issuer.currentRevision.shortcode ?? "no shortcode"}) &#32; updated with{" "}
      {changes.length} {changes.length === 1 ? "change" : "changes"}:
      <ul>{changes.map(renderListChange)}</ul>
    </fragment>
  );
}

function renderGroupedChanges(groupedChanges: GroupedChange[]): DocumentNode {
  return <fragment>{groupedChanges.map(renderListChanges)}</fragment>;
}

describeProtection<PolicyChangeNotificationCapabilitites, Draupnir>({
  name: PolicyChangeNotification.name,
  description: "Provides notification of policy changes from watched lists.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  factory(description, protectedRoomsSet, draupnir, capabilities, _settings) {
    return Ok(
      new PolicyChangeNotification(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

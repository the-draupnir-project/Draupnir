// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import {
  renderMentionPill,
  renderRoomPill,
} from "@the-draupnir-project/mps-interface-adaptor";
import {
  MemberBanSynchronisationProtection,
  PolicyRoomRevision,
  PolicyRuleChange,
  PolicyRuleChangeType,
  ProtectedRoomsSet,
  MemberBanIntentProjectionNode,
  ServerBanIntentProjectionNode,
  MemberBanIntentProjectionDelta,
  SetMembershipPolicyRevision,
  SetMembershipRevision,
  ServerBanSynchronisationProtection,
  ServerBanIntentProjectionDelta,
} from "matrix-protection-suite";

function watchDeltaForMemberBanIntents(
  setMembershipPoliciesRevision: SetMembershipPolicyRevision,
  setMembershipRevision: SetMembershipRevision,
  watchedPoliciesDelta: PolicyRuleChange[],
  memberBanIntentProjectionNode: MemberBanIntentProjectionNode
): MemberBanIntentProjectionDelta {
  const setMembershipPoliciesRevisionDelta =
    setMembershipPoliciesRevision.changesFromPolicyChanges(
      watchedPoliciesDelta,
      setMembershipRevision
    );
  return memberBanIntentProjectionNode.reduceInput(
    setMembershipPoliciesRevisionDelta
  );
}

function watchDeltaForServerBanIntents(
  watchedPoliciesDelta: PolicyRuleChange[],
  serverBanIntentProjectionNode: ServerBanIntentProjectionNode
) {
  return serverBanIntentProjectionNode.reduceInput(watchedPoliciesDelta);
}

export type WatchPolicyRoomPreview = {
  memberBanIntentProjectionDelta: MemberBanIntentProjectionDelta | undefined;
  serverBanIntentProjectionDelta: ServerBanIntentProjectionDelta | undefined;
  revision: PolicyRoomRevision;
};

export function generateWatchPreview(
  protectedRoomsSet: ProtectedRoomsSet,
  nextPolicyRoom: PolicyRoomRevision
): WatchPolicyRoomPreview {
  const previewPoliciesRevisionChanges = nextPolicyRoom
    .allRules()
    .map((rule) => ({
      changeType: PolicyRuleChangeType.Added,
      rule,
      event: rule.sourceEvent,
      sender: rule.sourceEvent.sender,
    }));
  const currentMemberBanIntentProjectionNode = (
    protectedRoomsSet.protections.findEnabledProtection(
      MemberBanSynchronisationProtection.name
    ) as MemberBanSynchronisationProtection | undefined
  )?.intentProjection.currentNode;
  const currentServerBanIntentProjectionNode = (
    protectedRoomsSet.protections.findEnabledProtection(
      ServerBanSynchronisationProtection.name
    ) as ServerBanSynchronisationProtection | undefined
  )?.intentProjection.currentNode;
  return {
    memberBanIntentProjectionDelta: currentMemberBanIntentProjectionNode
      ? watchDeltaForMemberBanIntents(
          protectedRoomsSet.setPoliciesMatchingMembership.currentRevision,
          protectedRoomsSet.setMembership.currentRevision,
          previewPoliciesRevisionChanges,
          currentMemberBanIntentProjectionNode
        )
      : undefined,
    serverBanIntentProjectionDelta: currentServerBanIntentProjectionNode
      ? watchDeltaForServerBanIntents(
          previewPoliciesRevisionChanges,
          currentServerBanIntentProjectionNode
        )
      : undefined,
    revision: nextPolicyRoom,
  };
}

export function renderMemberBanIntents(
  delta: MemberBanIntentProjectionDelta
): DocumentNode {
  return (
    <details>
      <summary>Draupnir intends to ban {delta.ban.length} users</summary>
      <ul>
        {delta.ban.map((userID) => (
          <li>
            {renderMentionPill(userID, userID)} (<code>{userID}</code>)
          </li>
        ))}
      </ul>
    </details>
  );
}

export function renderServerBanIntents(
  delta: ServerBanIntentProjectionDelta
): DocumentNode {
  return (
    <details>
      <summary>Draupnir intends to deny {delta.deny.length} servers</summary>
      <ul>
        {delta.deny.map((serverName) => (
          <li>
            <code>{serverName}</code>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function renderWatchPreview(
  preview: WatchPolicyRoomPreview
): DocumentNode {
  return (
    <fragment>
      <h4>
        Policy Room Subscription Preview for{" "}
        {renderRoomPill(preview.revision.room)}
      </h4>
      {preview.memberBanIntentProjectionDelta ? (
        renderMemberBanIntents(preview.memberBanIntentProjectionDelta)
      ) : (
        <fragment></fragment>
      )}
      {preview.serverBanIntentProjectionDelta ? (
        renderServerBanIntents(preview.serverBanIntentProjectionDelta)
      ) : (
        <fragment></fragment>
      )}
    </fragment>
  );
}

export function renderWatchCommandPreview(preview: WatchPolicyRoomPreview) {
  return <root>{renderWatchPreview(preview)}</root>;
}

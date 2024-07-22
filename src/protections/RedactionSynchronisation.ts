// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// README: This protection really exists as a stop gap to bring over redaction
// functionality over from Draupnir, while we figure out how to add redaction
// policies that operate on a timeline cache, which removes the painfull process
// that is currently used to repeatedly fetch `/messages`.

import {
  AbstractProtection,
  ActionResult,
  CapabilitySet,
  MatrixGlob,
  MembershipChange,
  MembershipChangeType,
  Ok,
  PolicyListRevision,
  PolicyRule,
  PolicyRuleChange,
  PolicyRuleType,
  PowerLevelPermission,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  Recommendation,
  RoomMembershipRevision,
  SimpleChangeType,
  StringRoomID,
  StringUserID,
  Task,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { redactUserMessagesIn } from "../utils";

type RedactionSynchronisationProtectionDescription =
  ProtectionDescription<Draupnir>;

export class RedactionSynchronisationProtection
  extends AbstractProtection<RedactionSynchronisationProtectionDescription>
  implements Protection<RedactionSynchronisationProtectionDescription>
{
  private automaticRedactionReasons: MatrixGlob[] = [];
  public constructor(
    description: RedactionSynchronisationProtectionDescription,
    capabilities: CapabilitySet,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {
      requiredPermissions: [PowerLevelPermission.Redact],
    });
    for (const reason of draupnir.config.automaticallyRedactForReasons) {
      this.automaticRedactionReasons.push(new MatrixGlob(reason.toLowerCase()));
    }
  }
  public redactForNewUserPolicy(policy: PolicyRule): void {
    const rooms: StringRoomID[] = [];
    if (policy.isGlob()) {
      this.protectedRoomsSet.allProtectedRooms.forEach((room) =>
        rooms.push(room.toRoomIDOrAlias())
      );
    } else {
      for (const roomMembership of this.protectedRoomsSet.setMembership
        .allRooms) {
        const membership = roomMembership.membershipForUser(
          policy.entity as StringUserID
        );
        if (membership !== undefined) {
          rooms.push(roomMembership.room.toRoomIDOrAlias());
        }
      }
    }
    void Task(
      redactUserMessagesIn(
        this.draupnir.client,
        this.draupnir.managementRoomOutput,
        policy.entity,
        rooms
      )
    );
  }
  public async handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<ActionResult<void>> {
    const relevantChanges = changes.filter(
      (change) =>
        change.changeType === SimpleChangeType.Added &&
        change.rule.kind === PolicyRuleType.User &&
        this.automaticRedactionReasons.some((reason) =>
          reason.test(change.rule.reason)
        )
    );
    // Can't see this fucking up at all when watching a new list :skull:.
    // So instead, we employ a genius big brain move.
    // Basically, this stops us from overwhelming draupnir with redaction
    // requests if the user watches a new list. Very unideal.
    // however, please see the comment at the top of the file which explains
    // how this protection **should** work, if it wasn't a stop gap.
    if (relevantChanges.length > 5) {
      return Ok(undefined);
    } else if (relevantChanges.length === 0) {
      return Ok(undefined);
    } else {
      relevantChanges.forEach((change) => {
        this.redactForNewUserPolicy(change.rule);
      });
      return Ok(undefined);
    }
  }
  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    const isUserJoiningWithPolicyRequiringRedaction = (
      change: MembershipChange
    ) => {
      if (
        change.membershipChangeType === MembershipChangeType.Joined ||
        change.membershipChangeType === MembershipChangeType.Rejoined
      ) {
        const policyRevision =
          this.protectedRoomsSet.issuerManager.policyListRevisionIssuer
            .currentRevision;
        const matchingPolicy = policyRevision.findRuleMatchingEntity(
          change.userID,
          PolicyRuleType.User,
          Recommendation.Ban
        );
        return (
          matchingPolicy !== undefined &&
          this.automaticRedactionReasons.some((reason) =>
            reason.test(matchingPolicy.reason)
          )
        );
      } else {
        return false;
      }
    };
    const relevantChanges = changes.filter(
      isUserJoiningWithPolicyRequiringRedaction
    );
    for (const change of relevantChanges) {
      void Task(
        redactUserMessagesIn(
          this.draupnir.client,
          this.draupnir.managementRoomOutput,
          change.userID,
          [revision.room.toRoomIDOrAlias()]
        )
      );
    }
    return Ok(undefined);
  }
}

describeProtection<Record<never, never>, Draupnir>({
  name: RedactionSynchronisationProtection.name,
  description:
    "Redacts messages when a new ban policy has been issued that matches config.automaticallyRedactForReasons. Work in progress.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  factory(description, protectedRoomsSet, draupnir, capabilities) {
    return Ok(
      new RedactionSynchronisationProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

// SPDX-FileCopyrightText: 2025 Emma [it/its] @ Rory& <matrix:u/emma:rory.gay>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AbstractProtection,
  ActionResult,
  CapabilitySet,
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
  Task,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { redactUserMessagesIn } from "../utils";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

type BanInviteRetractionProtectionDescription = ProtectionDescription<Draupnir>;

export class BanInviteRetractionProtection
  extends AbstractProtection<BanInviteRetractionProtectionDescription>
  implements Protection<BanInviteRetractionProtectionDescription> {
  public constructor(
    description: BanInviteRetractionProtectionDescription,
    capabilities: CapabilitySet,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir,
  ) {
    super(description, capabilities, protectedRoomsSet, {
      requiredPermissions: [PowerLevelPermission.Kick],
    });
  }

  public retractInvitesForNewUserPolicy(policy: PolicyRule): void {
    const rooms: StringRoomID[] = [];
    if (policy.isGlob()) {
      this.protectedRoomsSet.allProtectedRooms.forEach((room) =>
        rooms.push(room.toRoomIDOrAlias()),
      );
    } else {
      for (const roomMembership of this.protectedRoomsSet.setRoomMembership
        .allRooms) {
        const membership = roomMembership.membershipForUser(
          policy.entity as StringUserID,
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
        rooms,
      ),
    );
  }

  public async handlePolicyChange(
    revision: PolicyListRevision,
    changes: PolicyRuleChange[],
  ): Promise<ActionResult<void>> {
    const relevantChanges = changes.filter(
      (change) =>
        change.changeType === SimpleChangeType.Added &&
        change.rule.kind === PolicyRuleType.User,
    );

    // We don't care about the ramifications of adding a new list here.
    // The set of changes realistically should be fairly low.
    relevantChanges.forEach((change) => {
      this.retractInvitesForNewUserPolicy(change.rule);
    });
    return Ok(undefined);
  }

  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[],
  ): Promise<ActionResult<void>> {
    const isUserJoiningWithPolicyRequiringRedaction = (
      change: MembershipChange,
    ) => {
      if (
        change.membershipChangeType === MembershipChangeType.Joined ||
        change.membershipChangeType === MembershipChangeType.Rejoined
      ) {
        const policyRevision =
          this.protectedRoomsSet.watchedPolicyRooms.currentRevision;
        const matchingPolicy = policyRevision.findRuleMatchingEntity(
          change.userID,
          PolicyRuleType.User,
          Recommendation.Ban,
        );
        return matchingPolicy !== undefined;
      } else {
        return false;
      }
    };
    const relevantChanges = changes.filter(
      isUserJoiningWithPolicyRequiringRedaction,
    );
    for (const change of relevantChanges) {
      void Task(
        this.retractInvitesFromUserIn(
          revision.room.toRoomIDOrAlias(),
          change.userID,
        ),
      );
    }
    return Ok(undefined);
  }

  private async retractInvitesFromUserIn(room: StringRoomID, user: StringUserID): Promise<void> {
    const roomState = await this.draupnir.client.getRoomState(room);
    const invites = roomState.filter((event) =>
      event.type === "m.room.member"
      && event.content.membership === "invite"
      && event.sender === user,
    );

    for (const invite of invites) {
      await this.draupnir.client.kickUser(invite.state_key, room, "Retracting spam invites.");
    }
  }
}

describeProtection<Record<never, never>, Draupnir>({
  name: BanInviteRetractionProtection.name,
  description: "Retracts all outstanding invites sent by a banned user.",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  factory(description, protectedRoomsSet, draupnir, capabilities) {
    return Ok(
      new BanInviteRetractionProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir,
      ),
    );
  },
});

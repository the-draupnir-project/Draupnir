// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AbstractProtection,
  ActionResult,
  Capability,
  CapabilityMethodSchema,
  Membership,
  MembershipChange,
  MembershipChangeType,
  Ok,
  PolicyListRevision,
  PolicyRule,
  PolicyRuleChange,
  PolicyRuleChangeType,
  PolicyRuleMatchType,
  PolicyRuleType,
  PowerLevelPermission,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  Recommendation,
  RoomMembershipRevision,
  SetMembershipPolicyRevisionIssuer,
  SetRoomMembership,
  Task,
  UnknownConfig,
  WatchedPolicyRooms,
  describeCapabilityInterface,
  describeCapabilityProvider,
  describeCapabilityRenderer,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixGlob,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { isError, Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import { revisionRulesMatchingUser } from "../commands/unban/UnbanUsers";

export type RedactionSynchronisationProtectionCapabilitiesSet = {
  consequences: RedactionSynchronisationConsequences;
};

type RedactionSynchronisationProtectionDescription = ProtectionDescription<
  Draupnir,
  UnknownConfig,
  RedactionSynchronisationProtectionCapabilitiesSet
>;

// FIXME: We really need to design a capability interface for this protection...
// TBH doing so, would probably just be the UserConsequences capability...
// There shouldn't be much difference between this protection and MemberBanSynchronisation
// except this one applies when redaction reasons are given on policies and ban events.

// FIXME: Need to decide whether to use two consequences...
// the reason why we might need two is if calling redaction when there are invited
// users will cause issues,, we could just add a second method though.

// FIXME: Just add the invited users thing, we need that code here or there
// so may aswell do it and test it.

// FIXME: We should consider updating both SetMembership and SetMembershipPolicies
// to understand parted members...

export interface RedactionSynchronisationConsequences extends Capability {
  redactMessagesIn(
    userIDOrGlob: StringUserID,
    reason: string | undefined,
    roomIDs: StringRoomID[]
  ): Promise<Result<void>>;
  rejectInvite(
    roomID: StringRoomID,
    sender: StringUserID,
    reciever: StringUserID,
    reason: string | undefined
  ): Promise<Result<void>>;
}

describeCapabilityInterface({
  name: "RedactionSynchronisationConsequences",
  description: "Consequences for the RedactionSynchronisationProtection",
  schema: Type.Object({
    redactMessagesIn: CapabilityMethodSchema,
  }),
});

describeCapabilityProvider({
  name: "StandardRedactionSynchronisationConsequences",
  interface: "RedactionSynchronisationConsequences",
  description: "redacts events and rejects invitations send by the target",
  factory(description, draupnir: Draupnir) {
    return Object.freeze({
      requiredPermissions: [
        PowerLevelPermission.Redact,
        PowerLevelPermission.Kick,
      ],
      requiredStatePermissions: [],
      requiredEventPermissions: [],
      async redactMessagesIn(userIDOrGlob, reason, roomIDs) {
        const redactionResults = await Promise.all(
          roomIDs.map((roomID) =>
            draupnir.timelineRedactionQueue.enqueueRedaction(
              userIDOrGlob,
              roomID
            )
          )
        );
        const firstError = redactionResults.find((result) => isError(result));
        if (firstError) {
          return firstError;
        } else {
          return Ok(undefined);
        }
      },
      async rejectInvite(roomID, _sender, target, reason) {
        return await draupnir.clientPlatform
          .toRoomKicker()
          .kickUser(roomID, target, reason);
      },
    } satisfies RedactionSynchronisationConsequences);
  },
});

// FIXME: We really need capability rendering to be configurable.
describeCapabilityProvider({
  name: "SimulatedRedactionSynchronisationConsequences",
  interface: "RedactionSynchronisationConsequences",
  description: "Simulated redaction consequences",
  factory(_description, _context) {
    return Object.freeze({
      requiredPermissions: [],
      requiredStatePermissions: [],
      requiredEventPermissions: [],
      isSimulated: true,
      async redactMessagesIn() {
        return Ok(undefined);
      },
      async rejectInvite() {
        return Ok(undefined);
      },
    } satisfies RedactionSynchronisationConsequences);
  },
});

describeCapabilityRenderer({
  name: "StandardRedactionSynchronisationConsequencesRenderer",
  interface: "RedactionSynchronisationConsequences",
  description: "Doesn't render anything tbh, because it would be too annoying",
  isDefaultForInterface: true,
  factory(
    _protectionDescription,
    _context,
    provider: RedactionSynchronisationConsequences
  ) {
    return Object.freeze({
      ...(provider.isSimulated ? { isSimulated: true } : {}),
      requiredPermissions: provider.requiredPermissions,
      requiredStatePermissions: provider.requiredStatePermissions,
      requiredEventPermissions: provider.requiredEventPermissions,
      async redactMessagesIn(userIDOrGlob, reason, roomIDs) {
        return await provider.redactMessagesIn(userIDOrGlob, reason, roomIDs);
      },
      async rejectInvite(roomID, sender, reciever, reason) {
        return await provider.rejectInvite(roomID, sender, reciever, reason);
      },
    } satisfies RedactionSynchronisationConsequences);
  },
});

interface RedactionSynchronisation {
  // Used to check matching policies at startup.
  // Not used for applying redactions on match, since the new policy
  // hook is used for that.
  handlePermissionRequirementsMet(roomID: StringRoomID): void;
  // Used to check for when someone is trying to trigger draupnir to cleanup
  // or new policy was issued
  handlePolicyChange(policyChange: PolicyRuleChange): void;
  // Used to handle redactions/reject invitations as a user is banned
  handleMembershipChange(change: MembershipChange): void;
}

export class StandardRedactionSynchronisation
  implements RedactionSynchronisation
{
  public constructor(
    private readonly automaticRedactionReasons: MatrixGlob[],
    private readonly consequences: RedactionSynchronisationConsequences,
    private readonly watchedPolicyRooms: WatchedPolicyRooms,
    private readonly setRoomMembership: SetRoomMembership,
    private readonly setPoliciesMatchingMembership: SetMembershipPolicyRevisionIssuer
  ) {
    // nothing to do.
  }
  handlePermissionRequirementsMet(roomID: StringRoomID): void {
    const membershipRevision = this.setRoomMembership.getRevision(roomID);
    if (membershipRevision !== undefined) {
      this.checkRoomInvitations(membershipRevision);
    }
    for (const match of this.setPoliciesMatchingMembership.currentRevision.allMembersWithRules()) {
      if (membershipRevision?.membershipForUser(match.userID)) {
        const policyRequiringRedaction = match.policies.find((policy) =>
          this.isPolicyRequiringRedaction(policy)
        );
        if (policyRequiringRedaction !== undefined) {
          void Task(
            this.consequences.redactMessagesIn(
              match.userID,
              policyRequiringRedaction.reason,
              [roomID]
            )
          );
        }
      }
    }
  }
  handlePolicyChange(change: PolicyRuleChange): void {
    const policy = change.rule;
    if (change.changeType === PolicyRuleChangeType.Removed) {
      return;
    }
    if (policy.kind !== PolicyRuleType.User) {
      return;
    }
    if (policy.matchType === PolicyRuleMatchType.HashedLiteral) {
      return;
    }
    if (!this.isPolicyRequiringRedaction(policy)) {
      return;
    }
    const roomsRequiringRedaction =
      policy.matchType === PolicyRuleMatchType.Literal
        ? this.setRoomMembership.allRooms.filter((revision) =>
            revision.membershipForUser(StringUserID(policy.entity))
          )
        : this.setRoomMembership.allRooms;
    void Task(
      this.consequences.redactMessagesIn(
        StringUserID(policy.entity),
        policy.reason,
        roomsRequiringRedaction.map((revision) =>
          revision.room.toRoomIDOrAlias()
        )
      )
    );
    for (const revision of roomsRequiringRedaction) {
      this.checkRoomInvitations(revision);
    }
  }
  handleMembershipChange(change: MembershipChange): void {
    if (
      change.membershipChangeType === MembershipChangeType.Banned &&
      this.automaticRedactionReasons.some((reason) =>
        reason.test(change.content.reason ?? "<no reason supplied>")
      )
    ) {
      void Task(
        this.consequences.redactMessagesIn(change.userID, undefined, [
          change.roomID,
        ])
      );
      const membershipRevision = this.setRoomMembership.getRevision(
        change.roomID
      );
      if (membershipRevision) {
        this.checkRoomInvitations(membershipRevision);
      }
    }
  }

  private isPolicyRequiringRedaction(policy: PolicyRule): boolean {
    return this.automaticRedactionReasons.some((reason) =>
      reason.test(policy.reason ?? "<no reason supplied>")
    );
  }

  private checkRoomInvitations(
    membershipRevision: RoomMembershipRevision
  ): void {
    const invites = membershipRevision.membersOfMembership(Membership.Invite);
    for (const invite of invites) {
      const relevantRules = revisionRulesMatchingUser(
        invite.sender,
        [Recommendation.Takedown, Recommendation.Ban],
        this.watchedPolicyRooms.currentRevision
      ).filter((policy) => this.isPolicyRequiringRedaction(policy));
      if (relevantRules.length > 0) {
        void Task(
          this.consequences.rejectInvite(
            invite.roomID,
            invite.sender,
            invite.userID,
            relevantRules.find((policy) => policy.reason !== undefined)?.reason
          )
        );
      }
    }
  }
}

export class RedactionSynchronisationProtection
  extends AbstractProtection<RedactionSynchronisationProtectionDescription>
  implements Protection<RedactionSynchronisationProtectionDescription>
{
  private readonly redactionSynchronisation: RedactionSynchronisation;
  public constructor(
    description: RedactionSynchronisationProtectionDescription,
    capabilities: RedactionSynchronisationProtectionCapabilitiesSet,
    protectedRoomsSet: ProtectedRoomsSet,
    automaticallyRedactForReasons: string[]
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.redactionSynchronisation = new StandardRedactionSynchronisation(
      automaticallyRedactForReasons.map((reason) => new MatrixGlob(reason)),
      capabilities.consequences,
      protectedRoomsSet.watchedPolicyRooms,
      protectedRoomsSet.setRoomMembership,
      protectedRoomsSet.setPoliciesMatchingMembership
    );
  }

  public async handlePolicyChange(
    _revision: PolicyListRevision,
    changes: PolicyRuleChange[]
  ): Promise<ActionResult<void>> {
    changes.forEach((change) => {
      this.redactionSynchronisation.handlePolicyChange(change);
    });
    return Ok(undefined);
  }

  // Scan again on ban to make sure we mopped everything up.
  public async handleMembershipChange(
    _revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    changes.forEach((change) => {
      this.redactionSynchronisation.handleMembershipChange(change);
    });
    return Ok(undefined);
  }
}

describeProtection<RedactionSynchronisationProtectionCapabilitiesSet, Draupnir>(
  {
    name: RedactionSynchronisationProtection.name,
    description:
      "Redacts messages when a new ban policy has been issued that matches config.automaticallyRedactForReasons. Work in progress.",
    capabilityInterfaces: {
      consequences: "RedactionSynchronisationConsequences",
    },
    defaultCapabilities: {
      consequences: "StandardRedactionSynchronisationConsequences",
    },
    async factory(description, protectedRoomsSet, draupnir, capabilities) {
      return Ok(
        new RedactionSynchronisationProtection(
          description,
          capabilities,
          protectedRoomsSet,
          draupnir.config.automaticallyRedactForReasons
        )
      );
    },
  }
);

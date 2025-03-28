// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

// README: This protection really exists as a stop gap to bring over redaction
// functionality over from Draupnir, while we figure out how to add redaction
// policies that operate on a timeline cache, which removes the painfull process
// that is currently used to repeatedly fetch `/messages`.

import {
  AbstractProtection,
  ActionException,
  ActionExceptionKind,
  ActionResult,
  Capability,
  CapabilityMethodSchema,
  Membership,
  MembershipChange,
  MembershipChangeType,
  MembershipPolicyRevisionDelta,
  Ok,
  PolicyRule,
  PowerLevelPermission,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  Recommendation,
  RoomMembershipRevision,
  SetMembershipPolicyRevision,
  Task,
  UnknownConfig,
  describeCapabilityInterface,
  describeCapabilityProvider,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  MatrixGlob,
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import { revisionRulesMatchingUser } from "../commands/unban/UnbanUsers";
import { redactUserMessagesIn } from "../utils";

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

interface RedactionSynchronisationConsequences extends Capability {
  redactMessagesIn(
    userIDOrGlob: StringUserID,
    reason: string | undefined,
    roomIDs: StringRoomID[]
  ): Promise<Result<void>>;
  rejectInvite(
    roomID: StringRoomID,
    sender: StringUserID,
    target: StringUserID,
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
        const redactionResult = await redactUserMessagesIn(
          draupnir.client,
          draupnir.managementRoomOutput,
          userIDOrGlob,
          roomIDs
        ).then(
          (_) => Ok(undefined),
          (error) =>
            ActionException.Result(
              `Error redacting messages for ${userIDOrGlob}`,
              {
                exception: error,
                exceptionKind: ActionExceptionKind.Unknown,
              }
            )
        );
        return redactionResult;
      },
      async rejectInvite(roomID, _sender, target, reason) {
        return await draupnir.clientPlatform
          .toRoomKicker()
          .kickUser(roomID, target, reason);
      },
    } satisfies RedactionSynchronisationConsequences);
  },
});

export class RedactionSynchronisationProtection
  extends AbstractProtection<RedactionSynchronisationProtectionDescription>
  implements Protection<RedactionSynchronisationProtectionDescription>
{
  private automaticRedactionReasons: MatrixGlob[] = [];
  private readonly consequences: RedactionSynchronisationConsequences;
  public constructor(
    description: RedactionSynchronisationProtectionDescription,
    capabilities: RedactionSynchronisationProtectionCapabilitiesSet,
    protectedRoomsSet: ProtectedRoomsSet,
    draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.consequences = capabilities.consequences;
    for (const reason of draupnir.config.automaticallyRedactForReasons) {
      this.automaticRedactionReasons.push(new MatrixGlob(reason.toLowerCase()));
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
        this.protectedRoomsSet.watchedPolicyRooms.currentRevision
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

  public handlePermissionRequirementsMet(room: MatrixRoomID): void {
    const membershipRevision =
      this.protectedRoomsSet.setRoomMembership.getRevision(
        room.toRoomIDOrAlias()
      );
    if (membershipRevision !== undefined) {
      this.checkRoomInvitations(membershipRevision);
    }
    for (const match of this.protectedRoomsSet.setPoliciesMatchingMembership.currentRevision.allMembersWithRules()) {
      if (membershipRevision?.membershipForUser(match.userID)) {
        const policyRequiringRedaction = match.policies.find((policy) =>
          this.isPolicyRequiringRedaction(policy)
        );
        if (policyRequiringRedaction !== undefined) {
          void Task(
            this.consequences.redactMessagesIn(
              match.userID,
              policyRequiringRedaction.reason,
              [room.toRoomIDOrAlias()]
            )
          );
        }
      }
    }
  }

  public handleSetMembershipPolicyMatchesChange(
    revision: SetMembershipPolicyRevision,
    delta: MembershipPolicyRevisionDelta
  ): void {
    const matchesRequiringRedaction = delta.addedMemberMatches.filter((match) =>
      this.isPolicyRequiringRedaction(match.policy)
    );
    for (const match of matchesRequiringRedaction) {
      const roomsRequiringRedaction =
        this.protectedRoomsSet.setRoomMembership.allRooms
          .filter((revision) => revision.membershipForUser(match.userID))
          .map((revision) => revision.room.toRoomIDOrAlias());
      void Task(
        this.consequences.redactMessagesIn(
          match.userID,
          match.policy.reason,
          roomsRequiringRedaction
        )
      );
    }
  }

  // Scan again on ban to make sure we mopped everything up.
  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    for (const change of changes) {
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
        const membershipRevision =
          this.protectedRoomsSet.setRoomMembership.getRevision(change.roomID);
        if (membershipRevision) {
          this.checkRoomInvitations(membershipRevision);
        }
      }
    }
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
  }
);

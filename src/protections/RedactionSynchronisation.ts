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
  MembershipChange,
  MembershipChangeType,
  MembershipPolicyRevisionDelta,
  Ok,
  PowerLevelPermission,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomMembershipRevision,
  SetMembershipPolicyRevision,
  Task,
  describeProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { redactUserMessagesIn } from "../utils";
import { MatrixGlob } from "@the-draupnir-project/matrix-basic-types";

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

  // FIXME: In the future it would be really useful to have a policyMatches
  // revision per room. This can be worked out backwards from the PolicyMatches
  // revision using the setRoomMembership (both on SetMembershipPolicyMatches &
  // on SetRoomMembership change against SetMembershipPolicyMatches)...
  // it would probably be quite efficient
  // and would be really useful to for covering complete joins.
  public handleSetMembershipPolicyMatchesChange(
    revision: SetMembershipPolicyRevision,
    delta: MembershipPolicyRevisionDelta
  ): void {
    const matchesRequiringRedaction = delta.addedMemberMatches.filter((match) =>
      this.automaticRedactionReasons.some((reason) =>
        reason.test(match.policy.reason ?? "<no reason supplied>")
      )
    );
    for (const match of matchesRequiringRedaction) {
      const roomsRequiringRedaction =
        this.protectedRoomsSet.setRoomMembership.allRooms
          .filter((revision) => revision.membershipForUser(match.userID))
          .map((revision) => revision.room.toRoomIDOrAlias());
      void Task(
        redactUserMessagesIn(
          this.draupnir.client,
          this.draupnir.managementRoomOutput,
          match.userID,
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
          redactUserMessagesIn(
            this.draupnir.client,
            this.draupnir.managementRoomOutput,
            change.userID,
            [change.roomID]
          )
        );
      }
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

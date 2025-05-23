// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  AbstractProtection,
  ActionError,
  ActionResult,
  Logger,
  MembershipEvent,
  Ok,
  ProtectedRoomsSet,
  ProtectionDescription,
  StandardDeduplicator,
  Task,
  UnknownConfig,
  describeProtection,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../../Draupnir";
import { DraupnirProtection } from "../Protection";
import { isInvitationForUser, isSenderJoinedInRevision } from "./inviteCore";
import {
  renderMentionPill,
  renderRoomPill,
} from "../../commands/interface-manager/MatrixHelpRenderer";
import { renderFailedSingularConsequence } from "../../capabilities/CommonRenderers";
import { ProtectroomsOnInvite } from "./ProtectRoomsOnInvite";
import { WatchRoomsOnInvite } from "./WatchRoomsOnInvite";
import {
  StringRoomID,
  MatrixRoomReference,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { sendMatrixEventsFromDeadDocument } from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";

const log = new Logger("JoinRoomsOnInviteProtection");

export type JoinRoomsOnInviteProtectionCapabilities = Record<string, never>;
export type JoinRoomsOnInviteProtectionSettings = UnknownConfig;

export type JoinRoomsOnInviteProtectionDescription = ProtectionDescription<
  Draupnir,
  JoinRoomsOnInviteProtectionSettings,
  JoinRoomsOnInviteProtectionCapabilities
>;

export class JoinRoomsOnInviteProtection
  extends AbstractProtection<JoinRoomsOnInviteProtectionDescription>
  implements DraupnirProtection<JoinRoomsOnInviteProtectionDescription>
{
  private readonly promptedToProtectedDeduplicator =
    new StandardDeduplicator<StringRoomID>();
  private readonly protectRoomsOnInvite = new ProtectroomsOnInvite(
    this.draupnir,
    this.protectedRoomsSet
  );
  private readonly watchRoomsOnInvite = new WatchRoomsOnInvite(
    this.draupnir,
    this.protectedRoomsSet
  );
  public constructor(
    description: JoinRoomsOnInviteProtectionDescription,
    capabilities: JoinRoomsOnInviteProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
  }

  handleProtectionDisable(): void {
    this.protectRoomsOnInvite.handleProtectionDisable();
    this.watchRoomsOnInvite.handleProtectionDisable();
  }

  handleExternalMembership(roomID: StringRoomID, event: MembershipEvent): void {
    if (!isInvitationForUser(event, this.protectedRoomsSet.userID)) {
      return;
    }
    // The event handler gets called again when we join the room we were invited to.
    // As sometimes we get the invitation a second time from the join section of sync.
    if (this.promptedToProtectedDeduplicator.isDuplicate(roomID)) {
      return;
    }
    void Task(this.checkAgainstRequiredMembershipRoom(event));
  }

  private async checkAgainstRequiredMembershipRoom(
    event: MembershipEvent
  ): Promise<ActionResult<void>> {
    const revision = this.draupnir.acceptInvitesFromRoomIssuer.currentRevision;
    if (isSenderJoinedInRevision(event.sender, revision)) {
      return await this.joinAndIssuePrompts(event);
    } else {
      this.reportUnknownInvite(event, revision.room);
      return Ok(undefined);
    }
  }

  private reportUnknownInvite(
    event: MembershipEvent,
    requiredMembershipRoom: MatrixRoomReference
  ): void {
    const renderUnknownInvite = (): DocumentNode => {
      return (
        <root>
          {renderMentionPill(event.sender, event.sender)} has invited me to
          {renderRoomPill(MatrixRoomReference.fromRoomID(event.room_id))}
          but they are not joined to {renderRoomPill(requiredMembershipRoom)},
          which prevents me from accepting their invitation.
          <br />
          If you would like this room protected, use{" "}
          <code>!draupnir rooms add {event.room_id}</code>
        </root>
      );
    };
    void Task(
      sendMatrixEventsFromDeadDocument(
        this.draupnir.clientPlatform.toRoomMessageSender(),
        this.draupnir.managementRoomID,
        renderUnknownInvite(),
        {}
      ) as Promise<ActionResult<undefined>>
    );
  }

  private async joinInvitedRoom(
    event: MembershipEvent,
    room: MatrixRoomReference
  ): Promise<ActionResult<MatrixRoomReference>> {
    const renderFailedTojoin = (error: ActionError) => {
      const title = (
        <fragment>
          Unfortunately I was unable to accept the invitation from{" "}
          {renderMentionPill(event.sender, event.sender)} to the room{" "}
          {renderRoomPill(room)}.
        </fragment>
      );
      return (
        <root>
          {renderFailedSingularConsequence(this.description, title, error)}
        </root>
      );
    };
    const joinResult = await this.draupnir.clientPlatform
      .toRoomJoiner()
      .joinRoom(room);
    if (isError(joinResult)) {
      const sendResult = await sendMatrixEventsFromDeadDocument(
        this.draupnir.clientPlatform.toRoomMessageSender(),
        this.draupnir.managementRoomID,
        renderFailedTojoin(joinResult.error),
        {}
      );
      if (isError(sendResult)) {
        log.error(
          `couldn't send join failure to management room`,
          sendResult.error
        );
      }
    }
    return joinResult;
  }

  private async joinAndIssuePrompts(
    event: MembershipEvent
  ): Promise<ActionResult<void>> {
    const invitedRoomReference = MatrixRoomReference.fromRoomID(event.room_id, [
      userServerName(event.sender),
      userServerName(event.state_key),
    ]);
    const joinResult = await this.joinInvitedRoom(event, invitedRoomReference);
    if (isError(joinResult)) {
      return joinResult;
    }
    this.watchRoomsOnInvite.promptIfPossiblePolicyRoom(
      invitedRoomReference,
      event
    );
    if (
      !this.draupnir.config.protectAllJoinedRooms &&
      !this.protectedRoomsSet.isProtectedRoom(event.room_id)
    ) {
      this.protectRoomsOnInvite.promptToProtect(invitedRoomReference, event);
    }
    return Ok(undefined);
  }
}

describeProtection<JoinRoomsOnInviteProtectionCapabilities, Draupnir>({
  name: JoinRoomsOnInviteProtection.name,
  description:
    "Automatically joins rooms when invited by members of the management room and offers to protect them",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  factory(description, protectedRoomsSet, draupnir, capabilities, _settings) {
    return Ok(
      new JoinRoomsOnInviteProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

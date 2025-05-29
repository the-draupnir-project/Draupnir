// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result } from "@gnuxie/typescript-result";
import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  isError,
  Logger,
  ProtectedRoomsManager,
  Protection,
  ProtectionDescription,
  RoomCreator,
  RoomInviter,
  RoomMembershipManager,
  RoomStateEventSender,
} from "matrix-protection-suite";
import { Draupnir } from "../../Draupnir";

export type SettingChangeAndProtectionEnableCB<
  TProtectionDescription extends ProtectionDescription = ProtectionDescription,
> = (
  roomID: StringRoomID
) => Promise<Result<Protection<TProtectionDescription>>>;

export class NotificationRoomCreator<
  TProtectionDescription extends ProtectionDescription = ProtectionDescription,
> {
  public constructor(
    private readonly protectedRoomsManager: ProtectedRoomsManager,
    private readonly settingChangeCB: SettingChangeAndProtectionEnableCB<TProtectionDescription>,
    private readonly roomCreateCapability: RoomCreator,
    private readonly roomInviter: RoomInviter,
    private readonly roomStateEventCapability: RoomStateEventSender,
    private readonly roomName: string,
    private readonly draupnirUserID: StringUserID,
    private readonly draupnirManagementRoomID: StringRoomID,
    private readonly draupnirModerators: StringUserID[],
    private readonly log: Logger
  ) {
    // nothing to do.
  }

  public static async extractMembersFromManagementRoom(
    managementRoom: MatrixRoomID,
    draupnirUserID: StringUserID,
    membershipManager: RoomMembershipManager
  ): Promise<Result<StringUserID[]>> {
    const membershipRevisionIssuer =
      await membershipManager.getRoomMembershipRevisionIssuer(managementRoom);
    if (isError(membershipRevisionIssuer)) {
      return membershipRevisionIssuer;
    }
    const revision = membershipRevisionIssuer.ok.currentRevision;
    return Ok(
      [...revision.members()]
        .filter((member) => member.membership === "join")
        .map((member) => member.userID)
        .filter((userID) => userID !== draupnirUserID)
    );
  }

  public static async createNotificationRoomFromDraupnir<
    TProtectionDescription extends
      ProtectionDescription = ProtectionDescription,
  >(
    draupnir: Draupnir,
    description: TProtectionDescription,
    settings: Record<string, unknown>,
    notificationRoomSettingName: string,
    notificationRoomName: string,
    log: Logger
  ): Promise<Result<Protection<TProtectionDescription>>> {
    const moderators =
      await NotificationRoomCreator.extractMembersFromManagementRoom(
        draupnir.managementRoom,
        draupnir.clientUserID,
        draupnir.roomMembershipManager
      );
    if (isError(moderators)) {
      return moderators.elaborate("Unable to find the draupnir moderators");
    }
    const notificationRoomCreator =
      new NotificationRoomCreator<TProtectionDescription>(
        draupnir.protectedRoomsSet.protectedRoomsManager,
        async function (roomID: StringRoomID) {
          const newSettings = description.protectionSettings
            .toMirror()
            .setValue(settings, notificationRoomSettingName, roomID);
          if (isError(newSettings)) {
            return newSettings;
          }
          const result =
            await draupnir.protectedRoomsSet.protections.changeProtectionSettings(
              description,
              draupnir.protectedRoomsSet,
              draupnir,
              newSettings.ok
            );
          if (isError(result)) {
            return result.elaborate(
              "Unable to add the notification room to the protection settings"
            );
          }
          return result;
        },
        draupnir.clientPlatform.toRoomCreator(),
        draupnir.clientPlatform.toRoomInviter(),
        draupnir.clientPlatform.toRoomStateEventSender(),
        notificationRoomName,
        draupnir.clientUserID,
        draupnir.managementRoomID,
        moderators.ok,
        log
      );
    return await notificationRoomCreator.createMissingNotificationRoom();
  }

  public async createMissingNotificationRoom(): Promise<
    Result<Protection<TProtectionDescription>>
  > {
    const roomTitle = `${this.draupnirUserID}'s ${this.roomName}`;
    const newRoom = await this.roomCreateCapability.createRoom({
      preset: "private_chat",
      name: roomTitle,
    });
    if (isError(newRoom)) {
      this.log.error(
        `Failed to create notification room for ${this.roomName}`,
        newRoom.error
      );
      return newRoom;
    }
    const protectRoomResult = await this.protectedRoomsManager.addRoom(
      newRoom.ok
    );
    if (isError(protectRoomResult)) {
      this.log.error(
        `Failed to protect notification room for ${this.roomName}`,
        protectRoomResult.error
      );
      return protectRoomResult;
    }
    const protectionEnableResult = await this.settingChangeCB(
      newRoom.ok.toRoomIDOrAlias()
    );
    const restrictionResult =
      await this.roomStateEventCapability.sendStateEvent(
        newRoom.ok,
        "m.room.join_rules",
        "",
        {
          join_rule: "restricted",
          allow: [
            {
              room_id: this.draupnirManagementRoomID,
              type: "m.room_membership",
            },
          ],
        }
      );
    if (isError(restrictionResult)) {
      this.log.error(
        `Failed to restrict notification room for ${this.roomName}`,
        restrictionResult.error
      );
      return restrictionResult;
    }
    if (isError(protectionEnableResult)) {
      this.log.error(
        `Failed to enable protection for notification room for ${this.roomName}`,
        protectionEnableResult.error
      );
      return protectionEnableResult;
    }
    // We invite seperate to the /createRoom call because otherwise the entire /createRoom
    // call will fail if just one user couldn't be invited. Which is really bad.
    // This happens when servers are no longer reachable.
    for (const invitee of this.draupnirModerators) {
      const inviteResult = await this.roomInviter.inviteUser(
        newRoom.ok,
        invitee
      );
      if (isError(inviteResult)) {
        this.log.error(
          `Failed to invite moderator ${invitee} to notification room for ${this.roomName}`,
          inviteResult.error
        );
      }
    }
    return protectionEnableResult;
  }
}

// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { PowerLevelsEventContent } from "../MatrixTypes/PowerLevels";
import { RoomCreateEvent, RoomVersionMirror } from "../MatrixTypes/CreateRoom";

export enum PowerLevelPermission {
  Ban = "ban",
  Invite = "invite",
  Kick = "kick",
  Redact = "redact",
  EventsDefault = "events_default",
  StateDefault = "state_default",
}

export function isPowerLevelPermission(
  permission: string
): permission is PowerLevelPermission {
  switch (permission) {
    case PowerLevelPermission.Ban:
    case PowerLevelPermission.Invite:
    case PowerLevelPermission.Kick:
    case PowerLevelPermission.Redact:
    case PowerLevelPermission.EventsDefault:
    case PowerLevelPermission.StateDefault:
      return true;
    default:
      return false;
  }
}

/**
 * Used for directly introspecting on the power levels event.
 * Do not use to introspect on the room power levels because you need
 * to also consider the room create event and room version.
 *
 * FIXME: Guh technically the default behaviours are specific to the room version
 * too and the entire mirror.
 */
export const PowerLevelsEventMirror = Object.freeze({
  getUserPowerLevel(
    who: StringUserID,
    content?: PowerLevelsEventContent
  ): number {
    return content?.users?.[who] ?? content?.users_default ?? 0;
  },
  getStatePowerLevel(
    eventType: string,
    content?: PowerLevelsEventContent
  ): number {
    return content?.events?.[eventType] ?? content?.state_default ?? 50;
  },
  getEventPowerLevel(
    eventType: string,
    content?: PowerLevelsEventContent
  ): number {
    return content?.events?.[eventType] ?? content?.events_default ?? 0;
  },
  getPermissionPowerLevel(
    permission: PowerLevelPermission,
    content?: PowerLevelsEventContent
  ): number {
    const defaultPermissionLevel =
      permission === PowerLevelPermission.Invite ? 0 : 50;
    return content?.[permission] ?? defaultPermissionLevel;
  },
  isUserAbleToSendState(
    who: StringUserID,
    eventType: string,
    content?: PowerLevelsEventContent
  ): boolean {
    return (
      this.getUserPowerLevel(who, content) >=
      this.getStatePowerLevel(eventType, content)
    );
  },
  isUserAbleToUse(
    who: StringUserID,
    permission: PowerLevelPermission,
    content?: PowerLevelsEventContent
  ): boolean {
    const userLevel = this.getUserPowerLevel(who, content);
    const permissionLevel = this.getPermissionPowerLevel(permission, content);
    return userLevel >= permissionLevel;
  },
  isUserAbleToSendEvent(
    who: StringUserID,
    eventType: string,
    content?: PowerLevelsEventContent
  ): boolean {
    return (
      this.getUserPowerLevel(who, content) >=
      this.getEventPowerLevel(eventType, content)
    );
  },
});

export type MissingPermissionsChange = {
  missingStatePermissions: string[];
  missingPermissions: PowerLevelPermission[];
  missingEventPermissions: string[];
  isPrivilidgedInNextPowerLevels: boolean;
  isPrivilidgedInPriorPowerLevels: boolean;
};

export const PowerLevelsMirror = Object.freeze({
  isUserAbleToSendState(
    who: StringUserID,
    eventType: string,
    createEvent: RoomCreateEvent,
    powerLevelsContent?: PowerLevelsEventContent
  ): boolean {
    return (
      PowerLevelsEventMirror.isUserAbleToSendState(
        who,
        eventType,
        powerLevelsContent
      ) || RoomVersionMirror.isUserAPrivilegedCreator(who, createEvent)
    );
  },
  isUserAbleToUse(
    who: StringUserID,
    permission: PowerLevelPermission,
    createEvent: RoomCreateEvent,
    powerLevelsContent?: PowerLevelsEventContent
  ): boolean {
    return (
      PowerLevelsEventMirror.isUserAbleToUse(
        who,
        permission,
        powerLevelsContent
      ) || RoomVersionMirror.isUserAPrivilegedCreator(who, createEvent)
    );
  },
  isUserAbleToSendEvent(
    who: StringUserID,
    eventType: string,
    createEvent: RoomCreateEvent,
    powerLevelsContent?: PowerLevelsEventContent
  ): boolean {
    return (
      PowerLevelsEventMirror.isUserAbleToSendEvent(
        who,
        eventType,
        powerLevelsContent
      ) || RoomVersionMirror.isUserAPrivilegedCreator(who, createEvent)
    );
  },
  missingPermissions(
    clientUserID: StringUserID,
    requiredPermissions: PowerLevelPermission[],
    powerLevelsContent?: PowerLevelsEventContent
  ): PowerLevelPermission[] {
    const missingPermissions: PowerLevelPermission[] = [];
    for (const permission of requiredPermissions) {
      if (
        !PowerLevelsEventMirror.isUserAbleToUse(
          clientUserID,
          permission,
          powerLevelsContent
        )
      ) {
        missingPermissions.push(permission);
      }
    }
    return missingPermissions;
  },
  missingStatePermissions(
    clientUserID: StringUserID,
    requiredStatePermissions: string[],
    powerLevelsContent?: PowerLevelsEventContent
  ): string[] {
    const missingPermissions: string[] = [];
    for (const permission of requiredStatePermissions) {
      if (
        !PowerLevelsEventMirror.isUserAbleToSendState(
          clientUserID,
          permission,
          powerLevelsContent
        )
      ) {
        missingPermissions.push(permission);
      }
    }
    return missingPermissions;
  },
  missingEventPermissions(
    clientUserID: StringUserID,
    requiredEventPermissions: string[],
    powerLevelsContent?: PowerLevelsEventContent
  ): string[] {
    const missingPermissions: string[] = [];
    for (const permission of requiredEventPermissions) {
      if (
        !PowerLevelsEventMirror.isUserAbleToSendEvent(
          clientUserID,
          permission,
          powerLevelsContent
        )
      ) {
        missingPermissions.push(permission);
      }
    }
    return missingPermissions;
  },
  calculateMissingPermissionsInNewRoom(
    userID: StringUserID,
    options: {
      createEvent: RoomCreateEvent;
      nextPowerLevelsContent: PowerLevelsEventContent;
      requiredEventPermissions: string[];
      requiredPermissions: PowerLevelPermission[];
      requiredStatePermissions: string[];
    }
  ): MissingPermissionsChange {
    return this.calculateNewMissingPermissions(userID, {
      ...options,
      previousPowerLevelsContent: {
        users_default: -1,
      },
      isNewlyAddedRoom: true,
    });
  },
  calculateNewMissingPermissions(
    userID: StringUserID,
    {
      createEvent,
      nextPowerLevelsContent,
      previousPowerLevelsContent,
      requiredEventPermissions,
      requiredPermissions,
      requiredStatePermissions,
      isNewlyAddedRoom,
    }: {
      createEvent: RoomCreateEvent;
      nextPowerLevelsContent?: PowerLevelsEventContent;
      previousPowerLevelsContent?: PowerLevelsEventContent;
      requiredEventPermissions: string[];
      requiredPermissions: PowerLevelPermission[];
      requiredStatePermissions: string[];
      isNewlyAddedRoom?: boolean;
    }
  ): MissingPermissionsChange {
    if (RoomVersionMirror.isUserAPrivilegedCreator(userID, createEvent)) {
      return {
        missingStatePermissions: [],
        missingPermissions: [],
        missingEventPermissions: [],
        isPrivilidgedInNextPowerLevels: true,
        isPrivilidgedInPriorPowerLevels: isNewlyAddedRoom ? false : true,
      };
    }
    const nextMissingPermissions = this.missingPermissions(
      userID,
      requiredPermissions,
      nextPowerLevelsContent
    );
    const previousMissingPermissions = this.missingPermissions(
      userID,
      requiredPermissions,
      previousPowerLevelsContent
    );
    const nextMissingStatePermissions = this.missingStatePermissions(
      userID,
      requiredStatePermissions,
      nextPowerLevelsContent
    );
    const previousMissingStatePermissions = this.missingStatePermissions(
      userID,
      requiredStatePermissions,
      previousPowerLevelsContent
    );
    const nextMissingEventPermissions = this.missingEventPermissions(
      userID,
      requiredEventPermissions,
      nextPowerLevelsContent
    );
    const previousMissingEventPermissions = this.missingEventPermissions(
      userID,
      requiredEventPermissions,
      previousPowerLevelsContent
    );
    const isPrivilidgedInNextRevision =
      nextMissingStatePermissions.length === 0 &&
      nextMissingEventPermissions.length === 0 &&
      nextMissingPermissions.length === 0;
    const isPrivilidgedInPriorRevision =
      previousMissingStatePermissions.length === 0 &&
      previousMissingEventPermissions.length === 0 &&
      previousMissingPermissions.length === 0;
    return {
      missingStatePermissions: nextMissingStatePermissions,
      missingPermissions: nextMissingPermissions,
      missingEventPermissions: nextMissingEventPermissions,
      isPrivilidgedInNextPowerLevels: isPrivilidgedInNextRevision,
      isPrivilidgedInPriorPowerLevels: isPrivilidgedInPriorRevision,
    };
  },
});

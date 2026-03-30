// SPDX-FileCopyrightText: 2023-2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Task } from "../Interface/Task";
import { RoomEvent } from "../MatrixTypes/Events";
import { PolicyListRevision } from "../PolicyList/PolicyListRevision";
import { RevisionListener } from "../PolicyList/PolicyListRevisionIssuer";
import { PolicyRuleChange } from "../PolicyList/PolicyRuleChange";
import { EventReport } from "../Reporting/EventReport";
import { MembershipChange } from "../Membership/MembershipChange";
import { RoomMembershipRevision } from "../Membership/MembershipRevision";
import {
  SetRoomMembership,
  SetRoomMembershipListener,
} from "../Membership/SetRoomMembership";
import {
  SetRoomState,
  SetRoomStateListener,
} from "../StateTracking/SetRoomState";
import {
  RoomStateRevision,
  StateChange,
} from "../StateTracking/StateRevisionIssuer";
import { ProtectionsManager } from "./ProtectionsManager/ProtectionsManager";
import {
  PowerLevelsEvent,
  PowerLevelsEventContent,
} from "../MatrixTypes/PowerLevels";
import { Protection, ProtectionDescription } from "./Protection";
import {
  MissingPermissionsChange,
  PowerLevelsMirror,
} from "../Client/PowerLevelsMirror";
import {
  ProtectedRoomChangeType,
  ProtectedRoomsManager,
} from "./ProtectedRoomsManager/ProtectedRoomsManager";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import {
  StringUserID,
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { SetMembershipRevisionIssuer } from "../Membership/SetMembershipRevisionIssuer";
import {
  SetMembershipDelta,
  SetMembershipRevision,
} from "../Membership/SetMembershipRevision";
import {
  SetMembershipPolicyRevisionIssuer,
  StandardMembershipPolicyRevisionIssuer,
} from "../MembershipPolicies/SetMembershipPolicyRevisionIssuer";
import {
  MembershipPolicyRevisionDelta,
  SetMembershipPolicyRevision,
} from "../MembershipPolicies/MembershipPolicyRevision";
import { WatchedPolicyRooms } from "./WatchedPolicyRooms/WatchedPolicyRooms";
import { MixinExtractor } from "../SafeMatrixEvents/EventMixinExtraction/EventMixinExtraction";
import { RoomCreateEvent, RoomVersionMirror } from "../MatrixTypes/CreateRoom";

export interface ProtectedRoomsSet {
  readonly watchedPolicyRooms: WatchedPolicyRooms;
  readonly protectedRoomsManager: ProtectedRoomsManager;
  readonly protections: ProtectionsManager;
  readonly setRoomMembership: SetRoomMembership;
  readonly setMembership: SetMembershipRevisionIssuer;
  readonly setRoomState: SetRoomState;
  readonly setPoliciesMatchingMembership: SetMembershipPolicyRevisionIssuer;
  readonly userID: StringUserID;
  readonly allProtectedRooms: MatrixRoomID[];
  handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void;
  handleEventReport(report: EventReport): void;
  handleExternalMembership(roomID: StringRoomID, event: MembershipEvent): void;
  isProtectedRoom(roomID: StringRoomID): boolean;
  unregisterListeners(): void;
}

export type ProtectionPermissionsChange = {
  protection: Protection<ProtectionDescription>;
  permissionsChange: MissingPermissionsChange;
};

export type HandleMissingProtectionPermissions = (
  roomID: StringRoomID,
  protectionPermissions: ProtectionPermissionsChange[]
) => void;

export class StandardProtectedRoomsSet implements ProtectedRoomsSet {
  private readonly membershipChangeListener: SetRoomMembershipListener =
    this.setMembershipChangeListener.bind(this);
  private readonly policyChangeListener: RevisionListener =
    this.policyRevisionChangeListener.bind(this);
  private readonly stateChangeListener: SetRoomStateListener =
    this.stateRevisionChangeListener.bind(this);
  private readonly roomsChangeListener =
    this.protectedRoomsChangeListener.bind(this);
  private readonly setMembershiprevisionListener =
    this.setMembershipRevision.bind(this);
  private readonly setMembershipPolicyRevisionListener =
    this.setMembershipPolicyRevision.bind(this);
  public readonly setPoliciesMatchingMembership: SetMembershipPolicyRevisionIssuer;

  constructor(
    public readonly watchedPolicyRooms: WatchedPolicyRooms,
    public readonly protectedRoomsManager: ProtectedRoomsManager,
    public readonly protections: ProtectionsManager,
    public readonly userID: StringUserID,
    public readonly eventMixinExtractor: MixinExtractor,
    private readonly handleMissingProtectionPermissions?: HandleMissingProtectionPermissions
  ) {
    this.setRoomMembership.on("membership", this.membershipChangeListener);
    this.setRoomState.on("revision", this.stateChangeListener);
    watchedPolicyRooms.revisionIssuer.on("revision", this.policyChangeListener);
    this.protectedRoomsManager.on("change", this.roomsChangeListener);
    this.setMembership.on("revision", this.setMembershiprevisionListener);
    this.setPoliciesMatchingMembership =
      new StandardMembershipPolicyRevisionIssuer(
        this.setMembership,
        watchedPolicyRooms.revisionIssuer
      );
    this.setPoliciesMatchingMembership.on(
      "revision",
      this.setMembershipPolicyRevisionListener
    );
  }
  public get setRoomState() {
    return this.protectedRoomsManager.setRoomState;
  }
  public get setRoomMembership() {
    return this.protectedRoomsManager.setRoomMembership;
  }
  public get setMembership() {
    return this.protectedRoomsManager.setMembership;
  }
  public get allProtectedRooms() {
    return this.protectedRoomsManager.allProtectedRooms;
  }
  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    // this should only be responsible for passing through to protections.
    // The RoomMembershipManage (and its dependants)
    // The PolicyListManager (and its dependents)
    // The RoomStateManager (and its dependents)
    // should get informed directly elsewhere, since there's no reason
    // they cannot be shared across protected rooms sets.
    // The only slightly dodgy thing about that is the PolicyListManager
    // can depend on the RoomStateManager but i don't suppose it'll matter
    // they both are programmed to de-duplicate repeat events.
    const room = this.protectedRoomsManager.getProtectedRoom(roomID);
    if (room === undefined) {
      throw new TypeError(
        `The protected rooms set should not be being informed about events that it is not protecting`
      );
    }
    const mixinEvent = this.eventMixinExtractor.parseEvent(event);
    for (const protection of this.protections.allProtections) {
      if (protection.handleTimelineEvent !== undefined) {
        void Task(protection.handleTimelineEvent(room, event));
      }
      protection.handleTimelineEventMixins?.(room, mixinEvent);
    }
  }

  public handleEventReport(report: EventReport): void {
    for (const protection of this.protections.allProtections) {
      if (protection.handleEventReport === undefined) {
        continue;
      }
      void Task(protection.handleEventReport(report));
    }
  }
  public handleExternalMembership(
    roomID: StringRoomID,
    event: MembershipEvent
  ): void {
    for (const protection of this.protections.allProtections) {
      if (protection.handleExternalMembership === undefined) {
        continue;
      }
      protection.handleExternalMembership(roomID, event);
    }
  }

  public isProtectedRoom(roomID: StringRoomID): boolean {
    return this.protectedRoomsManager.isProtectedRoom(roomID);
  }

  private setMembershipChangeListener(
    _roomID: StringRoomID,
    nextRevision: RoomMembershipRevision,
    changes: MembershipChange[],
    _previousRevision: RoomMembershipRevision
  ): void {
    for (const protection of this.protections.allProtections) {
      if (protection.handleMembershipChange === undefined) {
        continue;
      }
      void Task(protection.handleMembershipChange(nextRevision, changes));
    }
  }

  private policyRevisionChangeListener(
    nextRevision: PolicyListRevision,
    changes: PolicyRuleChange[],
    _previousRevision: PolicyListRevision
  ): void {
    for (const protection of this.protections.allProtections) {
      if (protection.handlePolicyChange === undefined) {
        continue;
      }
      void Task(protection.handlePolicyChange(nextRevision, changes));
    }
  }

  /**
   * To be called only after power levels
   * have changed in a room. For some reason it's conflicted with
   * checking permissions within a room that has just been added.
   * Which is wrong.
   *
   * I really don't know how to fix this right now!!
   */
  private powerLevelsChangeFromContent(
    room: MatrixRoomID,
    createEvent: RoomCreateEvent,
    isNewlyAddedRoom: boolean,
    nextPowerLevels: PowerLevelsEventContent | undefined,
    previousPowerLevels: PowerLevelsEventContent | undefined
  ): void {
    // prividliged creators never change and always have permission.
    if (RoomVersionMirror.isUserAPrivilegedCreator(this.userID, createEvent)) {
      return;
    }
    const missingPermissionsInfo: ProtectionPermissionsChange[] = [];
    for (const protection of this.protections.allProtections) {
      const permissionsChange =
        PowerLevelsMirror.calculateNewMissingPermissions(this.userID, {
          nextPowerLevelsContent: nextPowerLevels ?? {},
          previousPowerLevelsContent: previousPowerLevels ?? {},
          requiredEventPermissions: protection.requiredEventPermissions,
          requiredPermissions: protection.requiredPermissions,
          requiredStatePermissions: protection.requiredStatePermissions,
          createEvent,
          isNewlyAddedRoom,
        });
      const {
        isPrivilidgedInNextPowerLevels,
        isPrivilidgedInPriorPowerLevels,
      } = permissionsChange;
      if (!isPrivilidgedInNextPowerLevels) {
        missingPermissionsInfo.push({
          protection,
          permissionsChange,
        });
      }
      if (isPrivilidgedInNextPowerLevels && !isPrivilidgedInPriorPowerLevels) {
        protection.handlePermissionRequirementsMet?.(room);
      }
    }
    if (missingPermissionsInfo.length !== 0) {
      this.handleMissingProtectionPermissions?.(
        room.toRoomIDOrAlias(),
        missingPermissionsInfo
      );
    }
  }

  private powerLevelsChangeFromRevision(
    nextRevision: RoomStateRevision,
    previousRevision: RoomStateRevision
  ): void {
    const previousPowerLevels =
      previousRevision.getStateEvent<PowerLevelsEvent>(
        "m.room.power_levels",
        ""
      );
    const nextPowerLevels = nextRevision.getStateEvent<PowerLevelsEvent>(
      "m.room.power_levels",
      ""
    );
    const createEvent = nextRevision.getStateEvent<RoomCreateEvent>(
      "m.room.create",
      ""
    );
    if (createEvent === undefined) {
      throw new TypeError(
        "Room with missing create event found, this is not ok"
      );
    }
    this.powerLevelsChangeFromContent(
      nextRevision.room,
      createEvent,
      false,
      nextPowerLevels?.content,
      previousPowerLevels?.content
    );
  }

  private stateRevisionChangeListener(
    _roomID: StringRoomID,
    nextRevision: RoomStateRevision,
    changes: StateChange[],
    previousRevision: RoomStateRevision
  ): void {
    const powerLevelsEvent = changes.find(
      (change) => change.eventType === "m.room.power_levels"
    );
    if (powerLevelsEvent !== undefined) {
      this.powerLevelsChangeFromRevision(nextRevision, previousRevision);
    }
    for (const protection of this.protections.allProtections) {
      if (protection.handleStateChange === undefined) {
        continue;
      }
      void Task(protection.handleStateChange(nextRevision, changes));
    }
  }

  private protectedRoomsChangeListener(
    room: MatrixRoomID,
    changeType: ProtectedRoomChangeType
  ): void {
    if (changeType !== ProtectedRoomChangeType.Added) {
      return;
    }
    const currentRevision = this.setRoomState.getRevision(
      room.toRoomIDOrAlias()
    );
    if (currentRevision === undefined) {
      throw new TypeError(
        `The SetRoomState is not being kept consistent with the number of protected rooms`
      );
    }
    const currentPowerLevelsEvent = currentRevision.getStateEvent(
      "m.room.power_levels",
      ""
    );
    const createEvent = currentRevision.getStateEvent<RoomCreateEvent>(
      "m.room.create",
      ""
    );
    if (createEvent === undefined) {
      throw new TypeError(
        "Room with missing create event found, this is not ok"
      );
    }
    // We call the powerLevelsChange so that handlePermissionsMet will be called
    // on protections for with the new room.
    // We also call powerLevelsChange so that the missing permissions CB will
    // get called if we don't have the right permissions for any protection in the new room.
    this.powerLevelsChangeFromContent(
      room,
      createEvent,
      true,
      currentPowerLevelsEvent?.content,
      // always treat the previous revision as though we are unprividdged in the new room.
      {
        users_default: -1,
      }
    );
  }

  private setMembershipRevision(
    nextRevision: SetMembershipRevision,
    changes: SetMembershipDelta
  ): void {
    for (const protection of this.protections.allProtections) {
      if (protection.handleSetMembershipChange !== undefined) {
        protection.handleSetMembershipChange(nextRevision, changes);
      }
    }
  }

  private setMembershipPolicyRevision(
    nextRevision: SetMembershipPolicyRevision,
    changes: MembershipPolicyRevisionDelta
  ): void {
    for (const protection of this.protections.allProtections) {
      if (protection.handleSetMembershipPolicyMatchesChange !== undefined) {
        protection.handleSetMembershipPolicyMatchesChange(
          nextRevision,
          changes
        );
      }
    }
  }

  public unregisterListeners(): void {
    // The most important listenres to reach is the setRoomState, setRoommMembership,
    // and policy revision listeners. Since these are tied to the global and
    // shared revision issuers that are given by the "RoomStateManager" deriratives.
    // The listener situation here kinda sucks, setting up and managing these relationships
    // should be left to some other component.
    this.setRoomMembership.off("membership", this.membershipChangeListener);
    this.setRoomMembership.unregisterListeners();
    this.setRoomState.off("revision", this.stateChangeListener);
    this.setRoomState.unregisterListeners();
    this.watchedPolicyRooms.revisionIssuer.off(
      "revision",
      this.policyChangeListener
    );
    this.watchedPolicyRooms.unregisterListeners();
    this.protectedRoomsManager.off("change", this.roomsChangeListener);
    this.protectedRoomsManager.unregisterListeners();
    this.protections.unregisterListeners();
    this.setMembership.off("revision", this.setMembershiprevisionListener);
    this.setMembership.unregisterListeners();
    this.setPoliciesMatchingMembership.off(
      "revision",
      this.setMembershipPolicyRevisionListener
    );
    this.setPoliciesMatchingMembership.unregisterListeners();
  }
}

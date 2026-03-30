// SPDX-FileCopyrightText: 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ActionError,
  ActionException,
  ActionExceptionKind,
  ActionResult,
  ClientsInRoomMap,
  EventDecoder,
  InternedInstanceFactory,
  Logger,
  Ok,
  PolicyRoomManager,
  PolicyRoomRevisionIssuer,
  PolicyRuleType,
  ResultError,
  RoomCreateEvent,
  RoomEvent,
  RoomMembershipManager,
  RoomMembershipRevisionIssuer,
  RoomStateBackingStore,
  RoomStateGetter,
  RoomStateManager,
  RoomStateMembershipRevisionIssuer,
  RoomStatePolicyRoomRevisionIssuer,
  RoomStateRevisionIssuer,
  RoomVersionMirror,
  SHA256HashStore,
  StandardPolicyRoomRevision,
  StandardRoomMembershipRevision,
  StandardRoomStateRevisionIssuer,
  StandardSHA256HashReverser,
  StateEvent,
  isError,
  isOk,
} from "matrix-protection-suite";
import { ClientForUserID } from "./ClientManagement";
import { BotSDKRoomMembershipManager } from "../StateTracking/RoomMembershipManager";
import { BotSDKPolicyRoomManager } from "../PolicyList/PolicyListManager";
import { Redaction } from "matrix-protection-suite/dist/MatrixTypes/Redaction";
import { BotSDKClientPlatform } from "../Client/BotSDKClientPlatform";
import { BotSDKBaseClient } from "../Client/BotSDKBaseClient";
import {
  StringRoomID,
  MatrixRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomStateRefresh } from "./RoomStateRefresh";

const log = new Logger("RoomStateManagerFactory");

export class RoomStateManagerFactory {
  private readonly roomStateRefresher = new RoomStateRefresh();
  private readonly roomStateIssuers: InternedInstanceFactory<
    StringRoomID,
    StandardRoomStateRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_roomID, room) => {
    const roomStateGetterResult =
      await this.getRoomStateGetterForRevisionIssuer(room);
    if (isError(roomStateGetterResult)) {
      return roomStateGetterResult;
    }
    const getInitialRoomState = async () => {
      if (this.roomStateBackingStore !== undefined) {
        const storeResult = await this.roomStateBackingStore.getRoomState(
          room.toRoomIDOrAlias()
        );
        if (isOk(storeResult)) {
          if (storeResult.ok !== undefined) {
            return Ok({ state: storeResult.ok, isFromStore: true });
          }
        } else {
          log.error(
            `Could not load room state from the backing store`,
            storeResult.error
          );
        }
      }
      const stateRequestResult =
        await roomStateGetterResult.ok.getAllState(room);
      if (isError(stateRequestResult)) {
        return stateRequestResult;
      }
      return Ok({ state: stateRequestResult.ok, isFromStore: false });
    };
    const stateResult = await getInitialRoomState();
    // TODO: This entire class needs moving the MPS main via client capabilities.
    //       so that it can be unit tested.
    if (isError(stateResult)) {
      return stateResult;
    }
    const issuer = new StandardRoomStateRevisionIssuer(
      room,
      roomStateGetterResult.ok,
      stateResult.ok.state
    );
    if (this.roomStateBackingStore) {
      issuer.on("revision", this.roomStateBackingStore.revisionListener);
    }
    // Refresh the state if it was loaded from the store
    if (stateResult.ok.isFromStore) {
      this.roomStateRefresher.refreshState(issuer);
    }
    return Ok(issuer);
  });

  private readonly policyRoomIssuers: InternedInstanceFactory<
    StringRoomID,
    PolicyRoomRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_key, room) => {
    const roomStateIssuer = await this.roomStateIssuers.getInstance(
      room.toRoomIDOrAlias(),
      room
    );
    if (isError(roomStateIssuer)) {
      return roomStateIssuer;
    }
    const issuer = new RoomStatePolicyRoomRevisionIssuer(
      room,
      StandardPolicyRoomRevision.blankRevision(room),
      roomStateIssuer.ok
    );
    this.sha256Reverser?.addPolicyRoomRevisionIssuer(issuer);
    return Ok(issuer);
  });

  private readonly roomMembershipIssuers: InternedInstanceFactory<
    StringRoomID,
    RoomMembershipRevisionIssuer,
    [MatrixRoomID]
  > = new InternedInstanceFactory(async (_roomID, room) => {
    const stateIssuer = await this.roomStateIssuers.getInstance(
      room.toRoomIDOrAlias(),
      room
    );
    if (isError(stateIssuer)) {
      return stateIssuer;
    }
    return Ok(
      new RoomStateMembershipRevisionIssuer(
        room,
        StandardRoomMembershipRevision.blankRevision(room).reviseFromMembership(
          stateIssuer.ok.currentRevision.getStateEventsOfType("m.room.member")
        ),
        stateIssuer.ok
      )
    );
  });

  private readonly sha256Reverser;
  constructor(
    public readonly clientsInRoomMap: ClientsInRoomMap,
    private readonly clientProvider: ClientForUserID,
    private readonly eventDecoder: EventDecoder,
    private readonly roomStateBackingStore: RoomStateBackingStore | undefined,
    private readonly hashStore: SHA256HashStore | undefined
  ) {
    this.sha256Reverser = this.hashStore
      ? new StandardSHA256HashReverser(this.hashStore)
      : undefined;
  }

  private async getRoomStateGetterForRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomStateGetter>> {
    const managedClientsInRoom = this.clientsInRoomMap.getManagedUsersInRoom(
      room.toRoomIDOrAlias()
    );
    const chosenClientUserID = managedClientsInRoom[0];
    if (chosenClientUserID === undefined) {
      return ActionError.Result(
        `There is no managed client in the room ${room.toPermalink()} and so we cannot fetch the room state there.`
      );
    }
    const client = await this.clientProvider(chosenClientUserID);
    const clientRooms =
      this.clientsInRoomMap.getClientRooms(chosenClientUserID);
    if (clientRooms === undefined) {
      throw new TypeError(`Cannot find clientRooms for ${chosenClientUserID}`);
    }
    return Ok(
      new BotSDKClientPlatform(
        new BotSDKBaseClient(
          client,
          chosenClientUserID,
          clientRooms,
          this.eventDecoder
        )
      ).toRoomStateGetter()
    );
  }

  private requestingUserNotJoined(
    clientUserID: StringUserID,
    room: MatrixRoomID
  ): ActionException {
    const message = `The user ${clientUserID} is not joined to the room ${room.toPermalink()}`;
    return new ActionException(
      ActionExceptionKind.Unknown,
      new Error(message),
      message
    );
  }

  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (
      this.clientsInRoomMap.isClientPreemptivelyInRoom(clientUserID, roomID)
    ) {
      return await this.roomStateIssuers.getInstance(
        room.toRoomIDOrAlias(),
        room
      );
    } else {
      return ResultError(this.requestingUserNotJoined(clientUserID, room));
    }
  }

  public async getRoomStateManager(
    clientUserID: StringUserID
  ): Promise<RoomStateManager> {
    return new BotSDKRoomStateManager(clientUserID, this);
  }

  public async getPolicyRoomRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<PolicyRoomRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (
      this.clientsInRoomMap.isClientPreemptivelyInRoom(clientUserID, roomID)
    ) {
      return await this.policyRoomIssuers.getInstance(roomID, room);
    } else {
      return ResultError(this.requestingUserNotJoined(clientUserID, room));
    }
  }

  public getEditablePolicyRoomIDs(
    editor: StringUserID,
    ruleType: PolicyRuleType
  ): MatrixRoomID[] {
    // This is kind of a workaround fix for https://github.com/the-draupnir-project/Draupnir/issues/946#issuecomment-3397228310.
    const privilegedCreatorRooms = this.roomStateIssuers
      .allInstances()
      .filter((issuer) => {
        const createEvent =
          issuer.currentRevision.getStateEvent<RoomCreateEvent>(
            "m.room.create",
            ""
          );
        if (createEvent === undefined) {
          return false;
        }
        return RoomVersionMirror.isUserAPrivilegedCreator(editor, createEvent);
      })
      .map((issuer) => issuer.room.toRoomIDOrAlias());
    const editableRoomIDs = this.policyRoomIssuers
      .allInstances()
      .filter(
        (issuer) =>
          issuer.currentRevision.isAbleToEdit(editor, ruleType) ||
          privilegedCreatorRooms.includes(issuer.room.toRoomIDOrAlias())
      )
      .map((issuer) => issuer.currentRevision.room);
    return editableRoomIDs;
  }

  public async getPolicyRoomManager(
    clientUserID: StringUserID
  ): Promise<PolicyRoomManager> {
    const client = await this.clientProvider(clientUserID);
    const clientRooms = this.clientsInRoomMap.getClientRooms(clientUserID);
    if (clientRooms === undefined) {
      throw new TypeError(`Cannot find clientRooms for ${clientUserID}`);
    }
    // FIXME: Shouldn't we have an equivalent of the clientProvider that
    // gives us a clientPlatform? or one that gives both the platform and the client?
    return new BotSDKPolicyRoomManager(
      clientUserID,
      client,
      new BotSDKClientPlatform(
        new BotSDKBaseClient(
          client,
          clientUserID,
          clientRooms,
          this.eventDecoder
        )
      ),
      this,
      this.clientsInRoomMap
    );
  }

  public async getRoomMembershipRevisionIssuer(
    room: MatrixRoomID,
    clientUserID: StringUserID
  ): Promise<ActionResult<RoomMembershipRevisionIssuer>> {
    const roomID = room.toRoomIDOrAlias();
    if (
      this.clientsInRoomMap.isClientPreemptivelyInRoom(clientUserID, roomID)
    ) {
      return await this.roomMembershipIssuers.getInstance(roomID, room);
    } else {
      return ResultError(this.requestingUserNotJoined(clientUserID, room));
    }
  }

  public async getRoomMembershipManager(
    clientUserID: StringUserID
  ): Promise<RoomMembershipManager> {
    const client = await this.clientProvider(clientUserID);
    return new BotSDKRoomMembershipManager(clientUserID, client, this);
  }

  public handleTimelineEvent(roomID: StringRoomID, event: RoomEvent): void {
    if (
      this.roomStateIssuers.hasInstance(roomID) &&
      ("state_key" in event || event.type === "m.room.redaction")
    ) {
      const issuer = this.roomStateIssuers.getStoredInstance(roomID);
      if (issuer === undefined) {
        throw new TypeError(
          "Somehow the has method for the interned instances is lying or the code is wrong"
        );
      }
      if (event.type === "m.room.redaction") {
        issuer.updateForRedaction(event as Redaction);
      } else {
        issuer.updateForEvent(event as StateEvent);
      }
    }
  }
}

class BotSDKRoomStateManager implements RoomStateManager {
  public constructor(
    public readonly clientUserID: StringUserID,
    private readonly factory: RoomStateManagerFactory
  ) {
    // nothing to do.
  }
  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    return await this.factory.getRoomStateRevisionIssuer(
      room,
      this.clientUserID
    );
  }
}

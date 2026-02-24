// Copyright (C) 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  StringRoomID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionError, ActionResult, Ok } from "../Interface/Action";
import { StateEvent } from "../MatrixTypes/Events";
import {
  DescribeRoomOptions,
  describeRoomStateEvents,
} from "./DeclareRoomState";
import { FakeRoomStateRevisionIssuer } from "./FakeRoomStateRevisionIssuer";
import {
  RoomStateManager,
  RoomStateRevisionIssuer,
} from "./StateRevisionIssuer";

export class FakeRoomStateManager implements RoomStateManager {
  private readonly roomStateRevisionIssuers = new Map<
    StringRoomID,
    FakeRoomStateRevisionIssuer
  >();

  public constructor(
    roomStateRevisionIssuers: FakeRoomStateRevisionIssuer[] = []
  ) {
    for (const issuer of roomStateRevisionIssuers) {
      this.roomStateRevisionIssuers.set(issuer.room.toRoomIDOrAlias(), issuer);
    }
  }

  public async getRoomStateRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomStateRevisionIssuer>> {
    const issuer = this.roomStateRevisionIssuers.get(room.toRoomIDOrAlias());
    if (issuer === undefined) {
      return ActionError.Result(
        `Canont find the room ${room.toRoomIDOrAlias()}`
      );
    } else {
      return Ok(issuer);
    }
  }
  getRoomState(_room: MatrixRoomID): Promise<ActionResult<StateEvent[]>> {
    throw new TypeError(
      `The FakeRoomStateManager is not capable of fetching RoomState`
    );
  }

  appendState({
    stateDescriptions = [],
    membershipDescriptions = [],
    policyDescriptions = [],
    room,
  }: Omit<DescribeRoomOptions, "room"> & { room: MatrixRoomID }): void {
    const { stateEvents } = describeRoomStateEvents({
      room,
      stateDescriptions,
      membershipDescriptions,
      policyDescriptions,
    });
    this.appendStateEvents(room, stateEvents);
  }

  appendStateEvents(room: MatrixRoomID, stateEvents: StateEvent[]): void {
    const issuer = this.roomStateRevisionIssuers.get(room.toRoomIDOrAlias());
    if (issuer === undefined) {
      throw new TypeError(
        `FakeRoomStateManager can't find which room you're trying to revise.`
      );
    }
    issuer.appendState(stateEvents);
  }

  addIssuer(issuer: FakeRoomStateRevisionIssuer): void {
    this.roomStateRevisionIssuers.set(issuer.room.toRoomIDOrAlias(), issuer);
  }
}

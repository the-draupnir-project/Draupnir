// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ClientRooms,
  EventDecoder,
  RoomCreator,
  RoomJoiner,
  RoomStateEventSender,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import { BotSDKBaseClient } from "./BotSDKBaseClient";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";

/**
 * This is a client that implements all granular capabilities specified in the
 * matrix-protection-suite. We depeond on the type system to enforce the attenuation
 * of capabilities, which is completely wrong. We should have the abilitiy to create
 * purpose built capabilities by using mixins, but this would require desgining
 * a purpose built object system on top of JS and this is something that would
 * take time and consideration to do properly.
 */
export class BotSDKAllClient
  extends BotSDKBaseClient
  implements RoomJoiner, RoomCreator, RoomStateEventSender
{
  public constructor(
    client: MatrixSendClient,
    clientRooms: ClientRooms,
    decoder: EventDecoder
  ) {
    super(client, clientRooms.clientUserID, clientRooms, decoder);
  }

  protected preemptTimelineJoin(roomID: StringRoomID): void {
    this.clientRooms.preemptTimelineJoin(roomID);
  }
}

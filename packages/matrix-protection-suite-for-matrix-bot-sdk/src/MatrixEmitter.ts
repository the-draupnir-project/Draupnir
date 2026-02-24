// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  StringRoomID,
  isStringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import EventEmitter from "events";
import { MatrixClient } from "matrix-bot-sdk";
import {
  MembershipEvent,
  EventDecoder,
  isError,
  Logger,
  RoomEvent,
  RoomMessage,
} from "matrix-protection-suite";

const log = new Logger("MatrixEmitter");

/**
 * This is an interface created in order to keep the event listener
 * Mjolnir uses for new events generic.
 * Used to provide a unified API for messages received from matrix-bot-sdk (using GET /sync)
 * when we're in single bot mode and messages received from matrix-appservice-bridge (using pushed /transaction)
 * when we're in appservice mode.
 *
 * The capability provided by these interfaces are too widespread though,
 * and any client using this library should use the protections API
 * to listen to events.
 */
export declare interface MatrixEmitter extends EventEmitter {
  on(
    event: "room.event",
    listener: (roomId: string, mxEvent: unknown) => void
  ): this;
  on(
    event: "room.message",
    listener: (roomId: string, mxEvent: unknown) => void
  ): this;
  on(
    event: "room.invite",
    listener: (roomId: string, mxEvent: unknown) => void
  ): this;
  on(
    event: "room.join",
    listener: (roomId: string, mxEvent: unknown) => void
  ): this;
  on(
    event: "room.leave",
    listener: (roomId: string, mxEvent: unknown) => void
  ): this;
  on(
    event: "room.archived",
    listener: (roomId: string, mxEvent: unknown) => void
  ): this;
  emit(event: "room.event", roomId: string, mxEvent: unknown): boolean;
  emit(event: "room.message", roomId: string, mxEvent: unknown): boolean;
  emit(event: "room.invite", roomId: string, mxEvent: unknown): boolean;
  emit(event: "room.join", roomId: string, mxEvent: unknown): boolean;
  emit(event: "room.leave", roomId: string, mxEvent: unknown): boolean;
  emit(event: "room.archived", roomId: string, mxEvent: unknown): boolean;
  start(): Promise<void>;
  stop(): void;
}

/**
 * A `MatrixClient` without the properties of `MatrixEmitter`.
 * This is in order to enforce listeners are added to `MatrixEmitter`s
 * rather than on the matrix-bot-sdk version of the matrix client.
 */
export type MatrixSendClient = Omit<
  MatrixClient,
  keyof MatrixEmitter | "crypto"
>;

export declare interface SafeMatrixEmitter extends MatrixEmitter {
  on(
    event: "room.event",
    listener: (roomID: StringRoomID, mxEvent: RoomEvent) => void
  ): this;
  on(
    event: "room.message",
    listener: (roomID: StringRoomID, mxEvent: RoomMessage) => void
  ): this;
  on(
    event: "room.invite",
    listener: (roomID: StringRoomID, mxEvent: MembershipEvent) => void
  ): this;
  on(
    event: "room.join",
    listener: (roomId: StringRoomID, mxEvent: MembershipEvent) => void
  ): this;
  on(
    event: "room.leave",
    listener: (roomID: StringRoomID, mxEvent: MembershipEvent) => void
  ): this;
  on(
    event: "room.archived",
    listener: (roomID: StringRoomID, mxEvent: RoomEvent) => void
  ): this;
  emit(
    event:
      | "room.event"
      | "room.message"
      | "room.invite"
      | "room.join"
      | "room.leave"
      | "room.archived",
    roomID: StringRoomID,
    mxEvent: RoomEvent
  ): boolean;
}

function makeListenerWrapper(
  decoder: EventDecoder,
  event:
    | "room.event"
    | "room.message"
    | "room.invite"
    | "room.join"
    | "room.leave"
    | "room.archived",
  safeEmitter: SafeMatrixEmitter
) {
  return function (roomId: string, mxEvent: Record<string, unknown>) {
    if (!isStringRoomID(roomId)) {
      throw new TypeError(`Got a malformed room_id ${roomId}`);
    }
    mxEvent["room_id"] = roomId;
    const decodeResult = decoder.decodeEvent(mxEvent);
    if (isError(decodeResult)) {
      log.error(
        `Got an error when decoding an event for a MatrixEmitter`,
        decodeResult.error.uuid,
        decodeResult.error
      );
      return;
    }
    safeEmitter.emit(event, roomId, decodeResult.ok);
  };
}

export class SafeMatrixEmitterWrapper
  extends EventEmitter
  implements SafeMatrixEmitter
{
  constructor(
    private readonly emitter: MatrixEmitter,
    private readonly decoder: EventDecoder
  ) {
    super();
    const events: (
      | "room.event"
      | "room.message"
      | "room.invite"
      | "room.join"
      | "room.leave"
      | "room.archived"
    )[] = [
      "room.event",
      "room.message",
      "room.invite",
      "room.join",
      "room.leave",
      "room.archived",
    ];
    for (const event of events) {
      // The overloads for event names in typescript don't quite work.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      //@ts-ignore
      emitter.on(event, makeListenerWrapper(this.decoder, event, this));
    }
  }
  start(): Promise<void> {
    return this.emitter.start();
  }
  stop(): void {
    this.emitter.stop();
  }
}

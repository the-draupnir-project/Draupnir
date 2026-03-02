// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StaticDecode, Type } from "@sinclair/typebox";
import { MatrixError } from "@vector-im/matrix-bot-sdk";
import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  MatrixException,
  Ok,
  RoomBanner,
  RoomCreateOptions,
  RoomCreator,
  RoomEventRedacter,
  RoomJoiner,
  RoomKicker,
  RoomStateEventSender,
  Value,
  isError,
  RoomEvent,
  EventDecoder,
  RoomMessageSender,
  MessageContent,
  ClientRooms,
  RoomStateGetter,
  StateEvent,
  Logger,
  MultipleErrors,
  ClientCapabilitiesNegotiation,
  ClientCapabilitiesResponse,
  RoomMessages,
  PaginationIterator,
  RoomMessagesOptions,
  RoomMessagesPaginator,
  PaginationChunk,
  RoomMessagesResponse,
  StandardPaginationIterator,
  RoomEventRelations,
  RoomEventRelationsPaginator,
  RoomEventRelationsOptions,
  RoomEventRelationsResponse,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import {
  MatrixRoomID,
  StringRoomID,
  StringUserID,
  MatrixRoomReference,
  StringRoomAlias,
  StringEventID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { resolveRoomReferenceSafe } from "../SafeMatrixClient";
import { ResultError } from "@gnuxie/typescript-result";
import util from "util";
import { RoomReactionSender } from "matrix-protection-suite/dist/Client/RoomReactionSender";
import { RoomEventGetter } from "matrix-protection-suite/dist/Client/RoomEventGetter";

const log = new Logger("BotSDKBaseClient");

const WeakError = Type.Object({
  message: Type.String(),
  name: Type.String(),
});

function toRoomID(room: MatrixRoomID | StringRoomID): StringRoomID {
  return typeof room === "string" ? room : room.toRoomIDOrAlias();
}

function matrixExceptionFromMatrixError(
  error: MatrixError
): ActionResult<never, MatrixException> {
  return MatrixException.R({
    exception: error,
    matrixErrorCode: error.errcode,
    matrixErrorMessage: error.error,
    message: error.message,
  });
}

function actionExceptionFromWeakError(
  error: StaticDecode<typeof WeakError>
): ActionResult<never, ActionException> {
  return ActionException.Result(error.message, {
    exception: error,
    exceptionKind: ActionExceptionKind.Unknown,
  });
}

function unknownError(error: unknown): never {
  const printedError = (() => {
    if (typeof error === "object" && error !== null) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      const toString = error.toString();
      if (toString !== "[object Object]") {
        return toString;
      }
    }
    try {
      return JSON.stringify(error);
    } catch {
      return util.inspect(error, {
        depth: 2,
        maxArrayLength: 10,
        breakLength: 80,
      });
    }
  })();
  throw new TypeError(
    `What on earth are you throwing exactly? because it isn't an error: ${printedError}`
  );
}

export function is404(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 404
  );
}

// Either i'm really tired right now or stupid.
// But I can't think of a way to share this definition with
// `resultifyBotSDKRequestError` without having never | undefined
// clients need to just have `never` when 404 isn't being checked!
export function resultifyBotSDKRequestErrorWith404AsUndefined(
  error: unknown
): ActionResult<undefined, ActionException> {
  if (is404(error)) {
    return Ok(undefined);
  }
  if (error instanceof MatrixError) {
    return matrixExceptionFromMatrixError(error);
  } else if (Value.Check(WeakError, error)) {
    return actionExceptionFromWeakError(error);
  } else {
    unknownError(error);
  }
}

export function resultifyBotSDKRequestError(
  error: unknown
): ActionResult<never, ActionException> {
  if (error instanceof MatrixError) {
    return matrixExceptionFromMatrixError(error);
  } else if (Value.Check(WeakError, error)) {
    return actionExceptionFromWeakError(error);
  } else {
    unknownError(error);
  }
}

export class BotSDKBaseClient
  implements
    ClientCapabilitiesNegotiation,
    RoomBanner,
    RoomCreator,
    RoomEventGetter,
    RoomEventRedacter,
    RoomEventRelations,
    RoomJoiner,
    RoomKicker,
    RoomMessages,
    RoomMessageSender,
    RoomReactionSender,
    RoomStateEventSender,
    RoomStateGetter
{
  public constructor(
    protected readonly client: MatrixSendClient,
    protected readonly clientUserID: StringUserID,
    protected readonly clientRooms: ClientRooms,
    protected readonly eventDecoder: EventDecoder
  ) {
    // nothing to do.
  }

  protected preemptTimelineJoin(_roomID: StringRoomID): void {
    // nothing to do.
  }

  public async getClientCapabilities(): Promise<
    ActionResult<ClientCapabilitiesResponse>
  > {
    return await this.client
      .doRequest("GET", "/_matrix/client/v3/capabilities")
      .then(
        (value) => Value.Decode(ClientCapabilitiesResponse, value),
        resultifyBotSDKRequestError
      );
  }

  public async sendMessage<TContent extends MessageContent>(
    roomID: StringRoomID,
    content: TContent
  ): Promise<ActionResult<StringEventID>> {
    return await this.client
      .sendMessage(roomID, content)
      .then(
        (eventID) => Ok(eventID as StringEventID),
        resultifyBotSDKRequestError
      );
  }

  public async getEvent<TRoomEvent extends RoomEvent>(
    roomID: StringRoomID,
    eventID: StringEventID
  ): Promise<ActionResult<TRoomEvent>> {
    return await this.client
      .getEvent(roomID, eventID)
      .then(
        (event) =>
          this.eventDecoder.decodeEvent(event) as ActionResult<TRoomEvent>,
        resultifyBotSDKRequestError
      );
  }

  public async getUndecodedEvent(
    roomID: StringRoomID,
    eventID: StringEventID
  ): Promise<ActionResult<Record<string, unknown>>> {
    return await this.client
      .getEvent(roomID, eventID)
      .then(
        (event) => Ok(event as Record<string, unknown>),
        resultifyBotSDKRequestError
      );
  }

  public async sendReaction(
    roomID: StringRoomID,
    eventID: StringEventID,
    key: string
  ): Promise<ActionResult<StringEventID>> {
    return await this.client.unstableApis
      .addReactionToEvent(roomID, eventID, key)
      .then(
        (eventID) => Ok(eventID as StringEventID),
        resultifyBotSDKRequestError
      );
  }

  public async resolveRoom(
    room: MatrixRoomReference | StringRoomAlias | StringRoomID
  ): Promise<ActionResult<MatrixRoomID>> {
    const roomReference = (() => {
      if (typeof room === "string") {
        return MatrixRoomReference.fromRoomIDOrAlias(room);
      } else {
        return room;
      }
    })();
    return await resolveRoomReferenceSafe(this.client, roomReference);
  }

  public async inviteUser(
    room: MatrixRoomID | StringRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>> {
    const roomID = room instanceof MatrixRoomID ? room.toRoomIDOrAlias() : room;
    return await this.client
      .doRequest(
        "POST",
        `/_matrix/client/v3/rooms/${encodeURIComponent(roomID)}/invite`,
        null,
        {
          user_id: userID,
          ...(reason ? { reason } : {}),
        }
      )
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }

  public async joinRoom(
    room: MatrixRoomReference | StringRoomID | StringRoomAlias,
    rawOptions?: { alwaysCallJoin?: boolean }
  ): Promise<ActionResult<MatrixRoomID>> {
    const alwaysCallJoin = rawOptions?.alwaysCallJoin ?? false;
    const resolvedReference = await this.resolveRoom(room);
    if (isError(resolvedReference)) {
      return resolvedReference;
    }
    if (
      !alwaysCallJoin &&
      this.clientRooms.isJoinedRoom(resolvedReference.ok.toRoomIDOrAlias())
    ) {
      return resolvedReference;
    }
    return await this.client
      .joinRoom(
        resolvedReference.ok.toRoomIDOrAlias(),
        resolvedReference.ok.getViaServers()
      )
      .then((roomID) => {
        this.preemptTimelineJoin(roomID as StringRoomID);
        return Ok(
          MatrixRoomReference.fromRoomID(
            roomID as StringRoomID,
            resolvedReference.ok.getViaServers()
          )
        );
      }, resultifyBotSDKRequestError);
  }

  public async createRoom(
    options: RoomCreateOptions
  ): Promise<ActionResult<MatrixRoomID>> {
    return await this.client.createRoom(options).then((roomID) => {
      this.preemptTimelineJoin(roomID as StringRoomID);
      return Ok(
        MatrixRoomReference.fromRoomID(roomID as StringRoomID, [
          userServerName(this.clientUserID),
        ])
      );
    }, resultifyBotSDKRequestError);
  }
  public async banUser(
    room: StringRoomID | MatrixRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>> {
    return await this.client
      .banUser(userID, toRoomID(room), reason)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
  public async kickUser(
    room: StringRoomID | MatrixRoomID,
    userID: StringUserID,
    reason?: string
  ): Promise<ActionResult<void>> {
    return await this.client
      .kickUser(userID, toRoomID(room), reason)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
  public async redactEvent(
    room: StringRoomID | MatrixRoomID,
    eventID: StringEventID,
    reason?: string
  ): Promise<ActionResult<StringEventID>> {
    return await this.client
      .redactEvent(toRoomID(room), eventID, reason)
      .then(
        (redactionEventID) => Ok(redactionEventID as StringEventID),
        resultifyBotSDKRequestError
      );
  }

  public toRoomEventRelationsPaginator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID,
    eventID: StringEventID
  ): RoomEventRelationsPaginator<TEvent> {
    return Object.freeze({
      client: this.client,
      eventDecoder: this.eventDecoder,
      async fetchPage(
        ergonomicOptions: RoomEventRelationsOptions
      ): Promise<ActionResult<PaginationChunk<TEvent>>> {
        const options = {
          ...ergonomicOptions,
          dir: ergonomicOptions.direction === "forwards" ? "f" : "b",
        };
        return this.client
          .doRequest(
            "GET",
            `/_matrix/client/v1/rooms/${encodeURIComponent(
              roomID
            )}/relations/${encodeURIComponent(eventID)}`,
            options
          )
          .then((response) => {
            const firstSchemaPass = Value.Decode(
              RoomEventRelationsResponse,
              response
            );
            if (isError(firstSchemaPass)) {
              return firstSchemaPass.elaborate(
                "The response for /relations is severly malformed"
              );
            }
            const parsedEvents: TEvent[] = [];
            for (const event of firstSchemaPass.ok.chunk) {
              const decodedEvent = this.eventDecoder.decodeEvent(event);
              if (isError(decodedEvent)) {
                return decodedEvent.elaborate(
                  "Failed to decode an event in the /relations response"
                );
              }
              parsedEvents.push(decodedEvent.ok as TEvent);
            }
            return Ok({
              previousToken: firstSchemaPass.ok.prev_batch,
              nextToken: firstSchemaPass.ok.next_batch,
              chunk: parsedEvents,
              hasNext: firstSchemaPass.ok.next_batch !== undefined,
              hasPrevious: true,
            } satisfies PaginationChunk<TEvent>);
          }, resultifyBotSDKRequestError);
      },
    });
  }

  toRoomEventRelationsIterator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID,
    eventID: StringEventID,
    options: RoomEventRelationsOptions
  ): PaginationIterator<TEvent> {
    return new StandardPaginationIterator(
      options,
      this.toRoomEventRelationsPaginator(roomID, eventID)
    );
  }

  public async getAllState<T extends StateEvent>(
    room: MatrixRoomID | StringRoomID
  ): Promise<ActionResult<T[]>> {
    const decodeResults = await this.client
      .getRoomState(toRoomID(room))
      .then(
        (events) =>
          Ok(events.map((event) => this.eventDecoder.decodeStateEvent(event))),
        resultifyBotSDKRequestError
      );
    if (isError(decodeResults)) {
      return decodeResults;
    }
    const errors: ResultError[] = [];
    const events: StateEvent[] = [];
    for (const result of decodeResults.ok) {
      if (isError(result)) {
        errors.push(result.error);
      } else {
        events.push(result.ok);
      }
    }
    if (errors.length > 0) {
      log.error(
        `There were multiple errors while decoding state events for ${room.toString()}`,
        MultipleErrors.Result(
          `Unable to decode state events in ${room.toString()}`,
          { errors }
        )
      );
    }
    return Ok(events as T[]);
  }
  public async unbanUser(
    room: StringRoomID | MatrixRoomID,
    userID: StringUserID
  ): Promise<ActionResult<void>> {
    return await this.client
      .unbanUser(userID, toRoomID(room))
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
  public async sendStateEvent(
    room: MatrixRoomID | StringRoomID,
    stateType: string,
    stateKey: string,
    content: Record<string, unknown>
  ): Promise<ActionResult<StringEventID>> {
    const roomID = room instanceof MatrixRoomID ? room.toRoomIDOrAlias() : room;
    return await this.client
      .sendStateEvent(roomID, stateType, stateKey, content)
      .then(
        (eventID) => Ok(eventID as StringEventID),
        resultifyBotSDKRequestError
      );
  }

  toRoomMessagesPaginator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID
  ): RoomMessagesPaginator<TEvent> {
    return Object.freeze({
      client: this.client,
      eventDecoder: this.eventDecoder,
      async fetchPage(
        ergonomicOptions: RoomMessagesOptions
      ): Promise<ActionResult<PaginationChunk<TEvent>>> {
        const options = {
          ...ergonomicOptions,
          ...(ergonomicOptions.filter
            ? { filter: JSON.stringify(ergonomicOptions.filter) }
            : {}),
          dir: ergonomicOptions.direction === "forwards" ? "f" : "b",
        };
        return this.client
          .doRequest(
            "GET",
            `/_matrix/client/v3/rooms/${encodeURIComponent(roomID)}/messages`,
            options
          )
          .then((response) => {
            const firstSchemaPass = Value.Decode(
              RoomMessagesResponse,
              response
            );
            if (isError(firstSchemaPass)) {
              return firstSchemaPass.elaborate(
                "The response for /messages is severly malformed"
              );
            }
            const parsedEvents: TEvent[] = [];
            for (const event of firstSchemaPass.ok.chunk) {
              const decodedEvent = this.eventDecoder.decodeEvent(event);
              if (isError(decodedEvent)) {
                return decodedEvent.elaborate(
                  "Failed to decode an event in the /messages response"
                );
              }
              parsedEvents.push(decodedEvent.ok as TEvent);
            }
            return Ok({
              previousToken: firstSchemaPass.ok.start,
              nextToken: firstSchemaPass.ok.end,
              chunk: parsedEvents,
              hasNext: firstSchemaPass.ok.end !== undefined,
              hasPrevious: true,
            } satisfies PaginationChunk<TEvent>);
          }, resultifyBotSDKRequestError);
      },
    });
  }
  toRoomMessagesIterator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID,
    options: RoomMessagesOptions
  ): PaginationIterator<TEvent> {
    return new StandardPaginationIterator(
      options,
      this.toRoomMessagesPaginator(roomID)
    );
  }
}

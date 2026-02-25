// SPDX-FileCopyrightText: 2023 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { EventEmitter } from "events";
import {
  ActionResult,
  ClientPlatform,
  Logger,
  ReactionContent,
  ReactionEvent,
  RoomEvent,
  Task,
  Value,
  isError,
} from "matrix-protection-suite";
import {
  StringRoomID,
  StringUserID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";
import { Ok, Result } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";

const log = new Logger("MatrixReactionHandler");

const REACTION_ANNOTATION_KEY =
  "ge.applied-langua.ge.draupnir.reaction_handler";

type ItemByReactionKey = Map<
  string /*reaction key*/,
  string /*serialized presentation*/
>;
export type ReactionListener = (
  key: string,
  item: string,
  additionalContext: unknown,
  reactionMap: ItemByReactionKey,
  annotatedEvent: RoomEvent
) => void;

export declare interface MatrixReactionHandlerListeners {
  on(eventName: string, listener: ReactionListener): void;
  emit(eventName: string, ...args: Parameters<ReactionListener>): void;
}

export const ReactionAnnotatedContent = Type.Object({
  [REACTION_ANNOTATION_KEY]: Type.Object({
    reaction_map: Type.Record(
      Type.String({ description: "The reaction key" }),
      Type.String({ description: "A value associated with the reaction key" })
    ),
    name: Type.String({
      description:
        "The name of the listener this reaction annotation is associated witih",
    }),
    additional_context: Type.Optional(Type.Unknown()),
  }),
});

/**
 * A utility that can be associated with an `MatrixEmitter` to listen for
 * reactions to Matrix Events. The aim is to simplify reaction UX.
 */
export class MatrixReactionHandler
  extends EventEmitter
  implements MatrixReactionHandlerListeners
{
  public constructor(
    /**
     * The room the handler is for. Cannot be enabled for every room as the
     * OG event lookup is very slow. So usually draupnir's management room.
     */
    public readonly roomID: StringRoomID,
    /**
     * The user id of the client. Ignores reactions from this user
     */
    private readonly clientUserID: StringUserID,
    private readonly clientPlatform: ClientPlatform
  ) {
    super();
  }

  /**
   * Handle an event from a `MatrixEmitter` and see if it is a reaction to
   * a previously annotated event. If it is a reaction to an annotated event,
   * then call its associated listener.
   * @param roomID The room the event took place in.
   * @param event The Matrix event.
   */
  public async handleEvent(
    roomID: StringRoomID,
    event: RoomEvent
  ): Promise<void> {
    if (roomID !== this.roomID) {
      return;
    }
    if (roomID !== event.room_id) {
      throw new TypeError(
        "The MatrixReactionHandler is being used incorrectly"
      );
    }
    if (event.sender === this.clientUserID) {
      return;
    }
    if (!Value.Check(ReactionContent, event.content)) {
      return;
    }
    const relatesTo = event.content["m.relates_to"];
    if (relatesTo === undefined) {
      return;
    }
    const reactionKey = relatesTo["key"];
    const relatedEventId = relatesTo["event_id"];
    if (
      !(typeof relatedEventId === "string" && typeof reactionKey === "string")
    ) {
      return;
    }
    const annotatedEvent = await this.clientPlatform
      .toRoomEventGetter()
      .getEvent(roomID, relatedEventId);
    if (isError(annotatedEvent)) {
      log.error(
        "Unable to get annotated event",
        roomID,
        relatedEventId,
        annotatedEvent.error
      );
      return;
    }
    if (!(REACTION_ANNOTATION_KEY in annotatedEvent.ok.content)) {
      return; // this event isn't annotated.
    }
    const decodedAnnotation = Value.Decode(
      ReactionAnnotatedContent,
      annotatedEvent.ok.content
    );
    if (isError(decodedAnnotation)) {
      log.error(
        `Unable to decode the annotation on an annotated event that was reacted to ${relatedEventId} in ${roomID}`,
        decodedAnnotation.error
      );
      return;
    }
    const reactionMap =
      decodedAnnotation.ok[REACTION_ANNOTATION_KEY].reaction_map;
    const listenerName = decodedAnnotation.ok[REACTION_ANNOTATION_KEY].name;
    const association = reactionKey in reactionMap && reactionMap[reactionKey];
    if (association === undefined) {
      log.info(
        `There wasn't a defined key for ${reactionKey} on event ${relatedEventId} in ${roomID}`
      );
      return;
    }
    this.emit(
      listenerName,
      reactionKey,
      association,
      decodedAnnotation.ok[REACTION_ANNOTATION_KEY]["additional_context"],
      new Map(Object.entries(reactionMap)),
      annotatedEvent.ok
    );
  }

  /**
   * Create the annotation required to setup a listener for when a reaction is encountered for the list.
   * @param listenerName The name of the event to emit when a reaction is encountered for a matrix event that matches a key in the `reactionMap`.
   * @param reactionMap A map of reaction keys to items that will be provided to the listener.
   * @param additionalContext Any additional context that should be associated with a matrix event for the listener.
   * @returns An object that should be deep copied into a the content of a new Matrix event.
   */
  public createAnnotation(
    listenerName: string,
    reactionMap: ItemByReactionKey,
    additionalContext: Record<string, unknown> | undefined
  ): Record<typeof REACTION_ANNOTATION_KEY, unknown> {
    return {
      [REACTION_ANNOTATION_KEY]: {
        name: listenerName,
        reaction_map: Object.fromEntries(reactionMap),
        additional_context: additionalContext,
      },
    };
  }

  /**
   * Use a reaction map to create the initial reactions to an event so that the user has access to quick reactions.
   * @param client A client to add the reactions with.
   * @param roomID The room id of the event to add the reactions to.
   * @param eventID The event id of the event to add reactions to.
   * @param reactionMap The reaction map.
   */
  public async addReactionsToEvent(
    roomID: StringRoomID,
    eventID: StringEventID,
    reactionMap: ItemByReactionKey
  ): Promise<Result<void>> {
    for (const key of reactionMap.keys()) {
      const reactionResult = await this.clientPlatform
        .toRoomReactionSender()
        .sendReaction(roomID, eventID, key);
      if (isError(reactionResult)) {
        log.error(
          `Could not add reaction to event ${eventID}`,
          reactionResult.error
        );
        return reactionResult;
      }
    }
    return Ok(undefined);
  }

  public async completePrompt(
    roomID: StringRoomID,
    eventID: StringEventID,
    reason?: string
  ): Promise<ActionResult<void>> {
    const redacter = this.clientPlatform.toRoomEventRedacter();
    return await this.clientPlatform
      .toRoomEventRelations()
      .toRoomEventRelationsIterator<ReactionEvent>(roomID, eventID, {
        relationType: "m.annotation",
        eventType: "m.reaction",
        direction: "backwards",
        limit: 100,
      })
      .forEachItem({
        forEachItemCB: (event) => {
          if (!Value.Check(ReactionContent, event.content)) {
            return;
          }
          const key = event.content["m.relates_to"]?.key;
          // skip the bots own reactions that mark the event as complete
          if (key === "✅" || key === "❌") {
            return;
          }
          void Task(
            redacter.redactEvent(roomID, event.event_id, reason) as Promise<
              ActionResult<void>
            >
          );
        },
      });
  }

  /**
   * Removes all reactions from the prompt event in an attempt to stop it being used further.
   */
  public async cancelPrompt(
    promptEvent: RoomEvent,
    cancelReason?: string
  ): Promise<ActionResult<void>> {
    const completeResult = await this.completePrompt(
      promptEvent.room_id,
      promptEvent.event_id,
      cancelReason ?? "prompt cancelled"
    );
    if (isError(completeResult)) {
      return completeResult;
    }
    const reactionResult = await this.clientPlatform
      .toRoomReactionSender()
      .sendReaction(
        promptEvent.room_id,
        promptEvent.event_id,
        `🚫 Cancelled by ${promptEvent.sender}`
      );
    if (isError(reactionResult)) {
      log.error(
        `Could not send cancelled reaction event for prompt ${promptEvent.event_id} in ${promptEvent.room_id}`,
        reactionResult.error
      );
    }
    return completeResult;
  }

  public static createItemizedReactionMap(items: string[]): ItemByReactionKey {
    return items.reduce((acc, item, index) => {
      const key = MatrixReactionHandler.numberToEmoji(index + 1);
      acc.set(key, item);
      return acc;
    }, new Map<string, string>());
  }

  public static numberToEmoji(number: number): string {
    // https://github.com/anton-bot/number-to-emoji
    // licensed with unlicense.
    const key = number.toString();
    return key
      .replace(/0/g, "0️⃣")
      .replace(/1/g, "1️⃣")
      .replace(/2/g, "2️⃣")
      .replace(/3/g, "3️⃣")
      .replace(/4/g, "4️⃣")
      .replace(/5/g, "5️⃣")
      .replace(/6/g, "6️⃣")
      .replace(/7/g, "7️⃣")
      .replace(/8/g, "8️⃣")
      .replace(/9/g, "9️⃣");
  }
}

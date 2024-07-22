// SPDX-FileCopyrightText: 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { EventEmitter } from "stream";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  ActionResult,
  ClientPlatform,
  Logger,
  ReactionEvent,
  RoomEvent,
  StringEventID,
  StringRoomID,
  StringUserID,
  Task,
  Value,
  isError,
} from "matrix-protection-suite";

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
     * A client to lookup the related events to reactions.
     */
    private readonly client: MatrixSendClient,
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
    if (event.sender === this.clientUserID) {
      return;
    }
    if (!Value.Check(ReactionEvent, event)) {
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
    const annotatedEvent = await this.client.getEvent(roomID, relatedEventId);
    const annotation = annotatedEvent.content[REACTION_ANNOTATION_KEY];
    if (annotation === undefined) {
      return;
    }
    const reactionMap = annotation["reaction_map"];
    if (typeof reactionMap !== "object" || reactionMap === null) {
      log.warn(
        `Missing reaction_map for the annotated event ${relatedEventId} in ${roomID}`
      );
      return;
    }
    const listenerName = annotation["name"];
    if (typeof listenerName !== "string") {
      log.warn(
        `The event ${relatedEventId} in ${roomID} is missing the name of the annotation`
      );
      return;
    }
    const association = reactionMap[reactionKey];
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
      annotation["additional_context"],
      new Map(Object.entries(reactionMap)),
      annotatedEvent
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
    additionalContext: Record<string, unknown> | undefined = undefined
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
   * @param roomId The room id of the event to add the reactions to.
   * @param eventId The event id of the event to add reactions to.
   * @param reactionMap The reaction map.
   */
  public async addReactionsToEvent(
    client: MatrixSendClient,
    roomId: string,
    eventId: string,
    reactionMap: ItemByReactionKey
  ): Promise<void> {
    await [...reactionMap.keys()]
      .reduce(
        (acc, key) =>
          acc.then((_) =>
            client.unstableApis.addReactionToEvent(roomId, eventId, key)
          ),
        Promise.resolve()
      )
      .catch((e: unknown) => {
        if (e instanceof Error) {
          log.error(`Could not add reaction to event ${eventId}`, e);
          return Promise.reject(e);
        } else {
          return Promise.reject(
            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
            new TypeError(`Something is throwing rubbish ${e}`)
          );
        }
      });
  }

  public async completePrompt(
    roomID: StringRoomID,
    eventID: StringEventID,
    reason?: string
  ): Promise<ActionResult<void>> {
    const eventRelationsGetter =
      this.clientPlatform.toRoomEventRelationsGetter();
    const redacter = this.clientPlatform.toRoomEventRedacter();
    return await eventRelationsGetter.forEachRelation<ReactionEvent>(
      roomID,
      eventID,
      {
        relationType: "m.annotation",
        eventType: "m.reaction",
        forEachCB: (event) => {
          const key = event.content?.["m.relates_to"]?.key;
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
      }
    );
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
    void this.client.unstableApis
      .addReactionToEvent(
        promptEvent.room_id,
        promptEvent.event_id,
        `🚫 Cancelled by ${promptEvent.sender}`
      )
      .catch((e: unknown) => {
        log.error(
          `Could not send cancelled reaction event for prompt ${promptEvent.event_id} in ${promptEvent.room_id}`,
          e
        );
      });
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

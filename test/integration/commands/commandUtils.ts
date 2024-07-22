import { MatrixClient } from "matrix-bot-sdk";
import { strict as assert } from "assert";
import * as crypto from "crypto";
import { MatrixEmitter } from "matrix-protection-suite-for-matrix-bot-sdk";
import { NoticeMessageContent, ReactionEvent, RoomEvent, StringEventID, TextMessageContent, Value } from "matrix-protection-suite";
import { Type } from "@sinclair/typebox";

export const ReplyContent = Type.Intersect([
    Type.Object({
        'm.relates_to': Type.Object({
            'm.in_reply_to': Type.Object({
                event_id: StringEventID,
            }),
        })
    }),
    Type.Union([
        NoticeMessageContent,
        TextMessageContent
    ])
]);
export type ReplyContent = typeof ReplyContent;

/**
 * Returns a promise that resolves to the first event replying to the event produced by targetEventThunk.
 * @param matrix A MatrixEmitter from a MatrixClient that is already in the targetRoom. We will use it to listen for the event produced by targetEventThunk.
 * This function assumes that the start() has already been called on the client.
 * @param targetRoom The room to listen for the reply in.
 * @param targetEventThunk A function that produces an event ID when called. This event ID is then used to listen for a reply.
 * @returns The replying event.
 */
export async function getFirstReply(matrix: MatrixEmitter, targetRoom: string, targetEventThunk: () => Promise<string>): Promise<RoomEvent<ReplyContent>> {
    return getNthReply(matrix, targetRoom, 1, targetEventThunk);
}

/**
 * Returns a promise that resolves to the nth event replying to the event produced by targetEventThunk.
 * @param matrix A MatrixEmitter from a MatrixClient that is already in the targetRoom. We will use it to listen for the event produced by targetEventThunk.
 * This function assumes that the start() has already been called on the client.
 * @param targetRoom The room to listen for the reply in.
 * @param n The number of events to wait for. Must be >= 1.
 * @param targetEventThunk A function that produces an event ID when called. This event ID is then used to listen for a reply.
 * @returns The replying event.
 */
export async function getNthReply(matrix: MatrixEmitter, targetRoom: string, n: number, targetEventThunk: () => Promise<string>): Promise<RoomEvent<ReplyContent>> {
    if (Number.isNaN(n) || !Number.isInteger(n) || n <= 0) {
        throw new TypeError(`Invalid number of events ${n}`);
    }
    const reactionEvents: RoomEvent[] = [];
    const addEvent = function (roomId: string, event: RoomEvent) {
        if (roomId !== targetRoom) return;
        if (event.type !== 'm.room.message') return;
        reactionEvents.push(event);
    };
    let targetCb;
    try {
        matrix.on('room.event', addEvent)
        const targetEventId = await targetEventThunk();
        if (typeof targetEventId !== 'string') {
            throw new TypeError();
        }
        for (const event of reactionEvents) {
            if (Value.Check(ReplyContent, event.content)) {
                const in_reply_to = event.content['m.relates_to']['m.in_reply_to'];
                if (in_reply_to.event_id === targetEventId) {
                    n -= 1;
                    if (n === 0) {
                        return event as RoomEvent<ReplyContent>;
                    }
                }
            }
        }
        return await new Promise(resolve => {
            targetCb = function(roomId: string, event: RoomEvent) {
                if (roomId !== targetRoom) return;
                if (event.type !== 'm.room.message') return;
                if (Value.Check(ReplyContent, event.content)) {
                    const in_reply_to = event.content['m.relates_to']['m.in_reply_to'];
                    if (in_reply_to.event_id === targetEventId) {
                        n -= 1;
                        if (n === 0) {
                            resolve(event as RoomEvent<ReplyContent>);
                        }
                    }
                }
            }
            matrix.on('room.event', targetCb);
        });
    } finally {
        matrix.removeListener('room.event', addEvent);
        // the type feedback for eslitn has to be wrong here i don't get it.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (targetCb) {
            matrix.removeListener('room.event', targetCb);
        }
    }
}


/**
 * Returns a promise that resolves to an event that is reacting to the event produced by targetEventThunk.
 * @param matrix A MatrixEmitter for a MatrixClient that is already in the targetRoom that can be started to listen for the event produced by targetEventThunk.
 * This function assumes that the start() has already been called on the client.
 * @param targetRoom The room to listen for the reaction in.
 * @param reactionKey The reaction key to wait for.
 * @param targetEventThunk A function that produces an event ID when called. This event ID is then used to listen for a reaction.
 * @returns The reaction event.
 */
export async function getFirstReaction(matrix: MatrixEmitter, targetRoom: string, reactionKey: string, targetEventThunk: () => Promise<string>): Promise<ReactionEvent> {
    const reactionEvents: ReactionEvent[] = [];
    const addEvent = function (roomId: string, event: RoomEvent) {
        if (roomId !== targetRoom) return;
        if (!Value.Check(ReactionEvent, event)) return;
        reactionEvents.push(event);
    };
    let targetCb;
    try {
        matrix.on('room.event', addEvent)
        const targetEventId = await targetEventThunk();
        for (const event of reactionEvents) {
            const relates_to = event.content?.['m.relates_to'];
            if (relates_to?.event_id === targetEventId && relates_to.key === reactionKey) {
                return event;
            }
        }
        return await new Promise((resolve) => {
            targetCb = function(roomId: string, event: RoomEvent) {
                if (roomId !== targetRoom) return;
                if (!Value.Check(ReactionEvent, event)) return;
                const relates_to = event.content['m.relates_to'];
                if (relates_to?.event_id === targetEventId && relates_to.key === reactionKey) {
                    resolve(event)
                }
            }
            matrix.on('room.event', targetCb);
        });
    } finally {
        matrix.off('room.event', addEvent);
        // idk why the type checker can't detect that this condition is necessary.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (targetCb) {
            matrix.off('room.event', targetCb);
        }
    }
}

/**
 * Get and wait for the first event that matches a predicate.
 * @param details.lookAfterEvent A function that returns an event id to look for
 * in the sync timeline before matching. Or a function that returns undefined if
 * `getFirstEventMatching` should start matching events right away.
 * @returns The event matching the predicate provided.
 */
export async function getFirstEventMatching(details: { matrix: MatrixEmitter, targetRoom: string, lookAfterEvent: () => Promise</*event id*/string|undefined>, predicate: (event: RoomEvent) => boolean }): Promise<RoomEvent> {
    let targetCb;
    try {
        return await new Promise((resolve) => {
            void details.lookAfterEvent().then((afterEventId: string|undefined) => {
                // if the event has returned an event id, then we will wait for that in the timeline,
                // otherwise the "event" isn't a matrix event and we just have to start looking right away.
                let isAfterEventId = afterEventId === undefined;
                targetCb = (roomId: string, event: RoomEvent) => {
                    if (event['event_id'] === afterEventId) {
                        isAfterEventId = true;
                        return;
                    }
                    if (isAfterEventId && details.predicate(event)) {
                        resolve(event);
                    }
                };
                details.matrix.on('room.event', targetCb)
            })
        })
    } finally {
        // unless i'm dumb, the type inference for this is wrong, and i don't know why.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (targetCb) {
            details.matrix.off('room.event', targetCb)
        }
    }
}

/**
 * Create a new banlist for mjolnir to watch and return the shortcode that can be used to refer to the list in future commands.
 * @param managementRoom The room to send the create command to.
 * @param mjolnir A syncing matrix client.
 * @param client A client that isn't mjolnir to send the message with, as you will be invited to the room.
 * @returns The shortcode for the list that can be used to refer to the list in future commands.
 */
export async function createBanList(managementRoom: string, mjolnir: MatrixEmitter, client: MatrixClient): Promise<string> {
    const listName = crypto.randomUUID();
    const listCreationResponse = await getFirstReply(mjolnir, managementRoom, async () => {
        return await client.sendMessage(managementRoom, { msgtype: 'm.text', body: `!mjolnir list create ${listName} ${listName}`});
    });
    assert.equal(listCreationResponse.content.body.includes('This list is now being watched.'), true, 'could not create a list to test with.');
    return listName;
}

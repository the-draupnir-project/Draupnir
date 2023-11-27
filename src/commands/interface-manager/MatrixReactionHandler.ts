/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { EventEmitter } from "stream";
import { LogService } from "matrix-bot-sdk";
import { MatrixSendClient, SafeMatrixEmitter } from "matrix-protection-suite-for-matrix-bot-sdk";

const REACTION_ANNOTATION_KEY = 'ge.applied-langua.ge.draupnir.reaction_handler';

type ItemByReactionKey = Map<string/*reaction key*/, any/*serialized presentation*/>;
export type ReactionListener = (key: string, item: any, additionalContext: unknown, reactionMap: ItemByReactionKey) => void;

/**
 * A utility that can be associated with an `MatrixEmitter` to listen for
 * reactions to Matrix Events. The aim is to simplify reaction UX.
 */
export class MatrixReactionHandler extends EventEmitter {

    private listener: MatrixReactionHandler['handleEvent'];

    public constructor(
        /**
         * The room the handler is for. Cannot be enabled for every room as the
         * OG event lookup is very slow.
         */
        public readonly roomId: string,
        /**
         * A client to lookup the related events to reactions.
         */
        private readonly client: MatrixSendClient,
        /**
         * The user id of the client. Ignores reactions from this user
         */
        private readonly clientUserId: string
    ) {
        super();
        this.listener = this.handleEvent.bind(this);
    }

    /**
     * Handle an event from a `MatrixEmitter` and see if it is a reaction to
     * a previously annotated event. If it is a reaction to an annotated event,
     * then call its associated listener.
     * @param roomId The room the event took place in.
     * @param event The Matrix event.
     */
    private async handleEvent(roomId: string, event: any): Promise<void> {
        if (roomId !== this.roomId) {
            return;
        }
        const relatesTo = event['content']?.['m.relates_to'];
        if (relatesTo === undefined) {
            return;
        }
        if (relatesTo['rel_type'] !== 'm.annotation') {
            return;
        }
        if (event['sender'] === this.clientUserId) {
            return;
        }
        const reactionKey = relatesTo['key'];
        const relatedEventId = relatesTo['event_id'];
        if (!(typeof relatedEventId === 'string' && typeof reactionKey === 'string')) {
            return;
        }
        const annotatedEvent = await this.client.getEvent(roomId, relatedEventId);
        const annotation = annotatedEvent.content[REACTION_ANNOTATION_KEY];
        if (annotation === undefined) {
            return;
        }
        const reactionMap = annotation['reaction_map'];
        if (typeof reactionMap !== 'object' || reactionMap === null) {
            LogService.warn('MatrixReactionHandler', `Missing reaction_map for the annotated event ${relatedEventId} in ${roomId}`);
            return;
        }
        const listenerName = annotation['name'];
        if (typeof listenerName !== 'string') {
            LogService.warn('MatrixReactionHandler', `The event ${relatedEventId} in ${roomId} is missing the name of the annotation`);
            return;
        }
        const association = reactionMap[reactionKey];
        if (association === undefined) {
            LogService.info('MatrixReactionHandler', `There wasn't a defined key for ${reactionKey} on event ${relatedEventId} in ${roomId}`);
            return;
        }
        this.emit(listenerName, reactionKey, association, annotation['additional_context'], new Map(Object.entries(reactionMap)));
    }

    /**
     * Start listening for reactions to events.
     * Called normally by an associated mjolnir instance when it is started.
     */
    public start(emitter: SafeMatrixEmitter): void {
        emitter.on('room.event', this.listener);
    }

    /**
     * Stop listening for reactions to events.
     */
    public stop(emitter: SafeMatrixEmitter): void {
        emitter.off('room.event', this.listener);
    }

    /**
     * Create the annotation required to setup a listener for when a reaction is encountered for the list.
     * @param listenerName The name of the event to emit when a reaction is encountered for a matrix event that matches a key in the `reactionMap`.
     * @param reactionMap A map of reaction keys to items that will be provided to the listener.
     * @param additionalContext Any additional context that should be associated with a matrix event for the listener.
     * @returns An object that should be deep copied into a the content of a new Matrix event.
     */
    public createAnnotation(listenerName: string, reactionMap: ItemByReactionKey, additionalContext: any = undefined): any {
        return {
            [REACTION_ANNOTATION_KEY]: {
                name: listenerName,
                reaction_map: Object.fromEntries(reactionMap),
                additional_context: additionalContext,
            }
        }
    }

    /**
     * Use a reaction map to create the initial reactions to an event so that the user has access to quick reactions.
     * @param client A client to add the reactions with.
     * @param roomId The room id of the event to add the reactions to.
     * @param eventId The event id of the event to add reactions to.
     * @param reactionMap The reaction map.
     */
    public async addReactionsToEvent(client: MatrixSendClient, roomId: string, eventId: string, reactionMap: ItemByReactionKey): Promise<void> {
        await [...reactionMap.keys()]
            .reduce((acc, key) => acc.then(_ => client.unstableApis.addReactionToEvent(roomId, eventId, key)),
                Promise.resolve()
            ).catch(e => (LogService.error('MatrixReactionHandler', `Could not add reaction to event ${eventId}`, e), Promise.reject(e)));
    }
}

/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { RoomAlias } from "matrix-bot-sdk";
import { Permalinks } from "./Permalinks";
import { traceSync, trace } from "../../utils";

type JoinRoom = (roomIdOrAlias: string, viaServers?: string[]) => Promise</*room id*/string>;
type ResolveRoom = (roomIdOrAlias: string) => Promise</* room id */string>

/**
 * This is a universal reference for a matrix room.
 * This is really useful because there are at least 3 ways of referring to a Matrix room,
 * and some of them require extra steps to be useful in certain contexts (aliases, permalinks).
 */
export abstract class MatrixRoomReference {
    protected constructor(
        protected readonly reference: string,
        protected readonly viaServers: string[] = []
    ) {

    }

    @traceSync('MatrixRoomReference.toPermalink')
    public toPermalink(): string {
        return Permalinks.forRoom(this.reference, this.viaServers);
    }

    @traceSync('MatrixRoomReference.fromAlias')
    public static fromAlias(alias: string): MatrixRoomReference {
        return new MatrixRoomAlias(alias);
    }

    public static fromRoomId(roomId: string, viaServers: string[] = []): MatrixRoomID {
        return new MatrixRoomID(roomId, viaServers);
    }

    @traceSync('MatrixRoomReference.fromRoomIdOrAlias')
    public static fromRoomIdOrAlias(roomIdOrAlias: string, viaServers: string[] = []): MatrixRoomReference {
        if (roomIdOrAlias.startsWith('!')) {
            return new MatrixRoomID(roomIdOrAlias, viaServers);
        } else {
            return new MatrixRoomAlias(roomIdOrAlias, viaServers);
        }
    }

    /**
     * Create a reference from a permalink.
     * @param permalink A permalink to a matrix room.
     * @returns A MatrixRoomReference.
     */
    @traceSync('MatrixRoomReference.fromPermalink')
    public static fromPermalink(permalink: string): MatrixRoomReference {
        const parts = Permalinks.parseUrl(permalink);
        if (parts.roomIdOrAlias === undefined) {
            throw new TypeError(`There is no room id or alias in the permalink ${permalink}`);
        }
        return MatrixRoomReference.fromRoomIdOrAlias(parts.roomIdOrAlias, parts.viaServers);
    }

    /**
     * Resolves the reference if necessary (ie it is a room alias) and return a new `MatrixRoomReference`.
     * Maybe in the future this should return a subclass that can only be a RoomID, that will be useful for the config
     * problems we're having...
     * @param client A client that we can use to resolve the room alias.
     * @returns A new MatrixRoomReference that contains the room id.
     */
    @trace('MatrixRoomReference.resolve')
    public async resolve(client: { resolveRoom: ResolveRoom }): Promise<MatrixRoomID> {
        if (this instanceof MatrixRoomID) {
            return this;
        } else {
            const alias = new RoomAlias(this.reference);
            const roomId = await client.resolveRoom(this.reference);
            return new MatrixRoomID(roomId, [alias.domain]);
        }
    }

    /**
     * Join the room using the client provided.
     * @param client A matrix client that should join the room.
     * @returns A MatrixRoomReference with the room id of the room which was joined.
     */
    @trace('MatrixRoomReference.joinClient')
    public async joinClient(client: { joinRoom: JoinRoom }): Promise<MatrixRoomID> {
        if (this.reference.startsWith('!')) {
            await client.joinRoom(this.reference, this.viaServers);
            return this;
        } else {
            const roomId = await client.joinRoom(this.reference);
            const alias = new RoomAlias(this.reference);
            // best we can do with the information we have.
            return new MatrixRoomID(roomId, [alias.domain]);
        }
    }

    /**
     * We don't include a `toRoomId` that uses `forceResolveAlias` as this would erase `viaServers`,
     * which will be necessary to use if our homeserver hasn't joined the room yet.
     * @returns A string representing a room id or alias.
     */
    @traceSync('MatrixRoomReference.toRoomIdOrAlias')
    public toRoomIdOrAlias(): string {
        return this.reference;
    }
}

export class MatrixRoomID extends MatrixRoomReference {
    public constructor(
        reference: string,
        viaServers: string[] = []
    ) {
        super(reference, viaServers);
    }
}

export class MatrixRoomAlias extends MatrixRoomReference {
    public constructor(
        reference: string,
        viaServers: string[] = []
    ) {
        super(reference, viaServers);
    }
}

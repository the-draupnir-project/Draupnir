/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { Permalinks, MatrixClient, RoomAlias } from "matrix-bot-sdk";

/**
 * This is a universal reference for a matrix room.
 * This is really useful because there are at least 3 ways of referring to a Matrix room,
 * and some of them require extra steps to be useful in certain contexts (aliases, permalinks).
 */
 export class MatrixRoomReference {
    private constructor(
        private readonly reference: string,
        private readonly viaServers: string[] = []
    ) {

    }

    /**
     * Join the room using the client provided.
     * @param client A matrix client that should join the room.
     * @returns The room id that was joined.
     */
    public async joinClient(client: MatrixClient): Promise<string> {
        return await client.joinRoom(this.reference, this.viaServers);
    }

    public toPermalink(): string {
        return Permalinks.forRoom(this.reference, this.viaServers);
    }

    public static fromAlias(alias: string): MatrixRoomReference {
        return new MatrixRoomReference(alias);
    }

    public static fromRoomId(roomId: string, viaServers: string[] = []): MatrixRoomReference {
        return new MatrixRoomReference(roomId, viaServers);
    }

    /**
     * Create a reference from a permalink.
     * @param permalink A permalink to a matrix room.
     * @returns A MatrixRoomReference.
     */
    public static fromPermalink(permalink: string): MatrixRoomReference {
        const parts = Permalinks.parseUrl(permalink);
        return new MatrixRoomReference(parts.roomIdOrAlias, parts.viaServers);
    }

    /**
     * Resolves the reference if necessary (ie it is a room alias) and return a new `MatrixRoomReference`.
     * Maybe in the future this should return a subclass that can only be a RoomID, that will be useful for the config
     * problems we're having...
     * @param client A client that we can use to resolve the room alias.
     * @returns A new MatrixRoomReference that contains the room id.
     */
    public async resolve(client: MatrixClient): Promise<MatrixRoomReference> {
        if (this.reference.startsWith('!')) {
            return this;
        } else {
            const alias = new RoomAlias(this.reference);
            const roomId = await client.resolveRoom(this.reference);
            return new MatrixRoomReference(roomId, [alias.domain]);
        }
    }

    /**
     * We don't include a `toRoomId` that uses `forceResolveAlias` as this would erase `viaServers`,
     * which will be necessary to use if our homeserver hasn't joined the room yet.
     * @returns A string representing a room id or alias.
     */
    public toRoomIdOrAlias(): string {
        return this.reference;
    }
}
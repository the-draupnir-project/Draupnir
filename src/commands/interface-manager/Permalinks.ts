/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is only really here while we wait for
 * https://github.com/turt2live/matrix-bot-sdk/pull/300
 * to be merged and be used by matrix-appservice-bridge too.
 *
 * This file incorperates work from matrix-bot-sdk
 * https://github.com/turt2live/matrix-bot-sdk
 * which included the following license notice:
MIT License

Copyright (c) 2018 - 2022 Travis Ralston

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
 */

import { trace } from '../../utils';

/**
 * The parts of a permalink.
 * @see Permalinks
 * @category Utilities
 */
export interface PermalinkParts {
    /**
     * The room ID or alias the permalink references. May be undefined.
     */
    roomIdOrAlias?: string;

    /**
     * The user ID the permalink references. May be undefined.
     */
    userId?: string;

    /**
     * The event ID the permalink references. May be undefined.
     */
    eventId?: string;

    /**
     * The servers the permalink is routed through.
     */
    viaServers: string[];
}

/**
 * Functions for handling permalinks
 * @category Utilities
 */
export class Permalinks {
    private constructor() {
    }

    @trace
    private static encodeViaArgs(servers: string[]): string {
        if (!servers || !servers.length) return "";

        return `?via=${servers.join("&via=")}`;
    }

    /**
     * Creates a room permalink.
     * @param {string} roomIdOrAlias The room ID or alias to create a permalink for.
     * @param {string[]} viaServers The servers to route the permalink through.
     * @returns {string} A room permalink.
     */
    @trace
    public static forRoom(roomIdOrAlias: string, viaServers: string[] = []): string {
        return `https://matrix.to/#/${encodeURIComponent(roomIdOrAlias)}${Permalinks.encodeViaArgs(viaServers)}`;
    }

    /**
     * Creates a user permalink.
     * @param {string} userId The user ID to create a permalink for.
     * @returns {string} A user permalink.
     */
    @trace
    public static forUser(userId: string): string {
        return `https://matrix.to/#/${encodeURIComponent(userId)}`;
    }

    /**
     * Creates an event permalink.
     * @param {string} roomIdOrAlias The room ID or alias to create a permalink in.
     * @param {string} eventId The event ID to reference in the permalink.
     * @param {string[]} viaServers The servers to route the permalink through.
     * @returns {string} An event permalink.
     */
    @trace
    public static forEvent(roomIdOrAlias: string, eventId: string, viaServers: string[] = []): string {
        return `https://matrix.to/#/${encodeURIComponent(roomIdOrAlias)}/${encodeURIComponent(eventId)}${Permalinks.encodeViaArgs(viaServers)}`;
    }

    /**
     * Parses a permalink URL into usable parts.
     * @param {string} matrixTo The matrix.to URL to parse.
     * @returns {PermalinkParts} The parts of the permalink.
     */
    @trace
    public static parseUrl(matrixTo: string): PermalinkParts {
        const matrixToRegexp = /^https:\/\/matrix\.to\/#\/(?<entity>[^/?]+)\/?(?<eventId>[^?]+)?(?<query>\?[^]*)?$/;

        const url = matrixToRegexp.exec(matrixTo)?.groups;
        if (!url) {
            throw new Error("Not a valid matrix.to URL");
        }

        const entity = decodeURIComponent(url.entity);
        if (entity[0] === '@') {
            return { userId: entity, roomIdOrAlias: undefined, eventId: undefined, viaServers: [] };
        } else if (entity[0] === '#' || entity[0] === '!') {
            return {
                userId: undefined,
                roomIdOrAlias: entity,
                eventId: url.eventId && decodeURIComponent(url.eventId),
                viaServers: new URLSearchParams(url.query).getAll('via'),
            };
        } else {
            throw new Error("Unexpected entity");
        }
    }
}

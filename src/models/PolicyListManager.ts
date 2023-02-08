/**
 * Copyright (C) 2022-2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019-2023 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
 *
 * However, this file is modified and the modifications in this file
 * are NOT distributed, contributed, committed, or licensed under the Apache License.
 */

import { LogLevel, LogService, Permalinks } from "matrix-bot-sdk";
import { Mjolnir } from "../Mjolnir";
import { MatrixDataManager, RawSchemedData, SCHEMA_VERSION_KEY } from "./MatrixDataManager";
import { MatrixRoomReference } from "../commands/interface-manager/MatrixRoomReference";
import { PolicyList, WATCHED_LISTS_EVENT_TYPE, WARN_UNPROTECTED_ROOM_EVENT_PREFIX } from "./PolicyList";

type WatchedListsEvent = RawSchemedData & { references?: string[]; };
/**
 * Manages the policy lists that a Mjolnir watches
 */

export class PolicyListManager extends MatrixDataManager<WatchedListsEvent> {
    private policyLists: PolicyList[];

    protected schema = [];
    protected isAllowedToInferNoVersionAsZero = true;

    constructor(private readonly mjolnir: Mjolnir) {
        super();
    }

    public get lists(): PolicyList[] {
        return [...this.policyLists];
    }

    public resolveListShortcode(listShortcode: string): PolicyList | undefined {
        return this.lists.find(list => list.listShortcode.toLocaleLowerCase() === listShortcode);
    }

    /**
     * Helper for constructing `PolicyList`s and making sure they have the right listeners set up.
     * @param roomId The room id for the `PolicyList`.
     * @param roomRef A reference (matrix.to URL) for the `PolicyList`.
     */
    private async addPolicyList(roomId: string, roomRef: string): Promise<PolicyList> {
        const list = new PolicyList(roomId, roomRef, this.mjolnir.client);
        this.mjolnir.ruleServer?.watch(list);
        await list.updateList();
        this.policyLists.push(list);
        this.mjolnir.protectedRoomsTracker.watchList(list);

        return list;
    }

    public async watchList(roomRef: string): Promise<PolicyList | null> {
        const joinedRooms = await this.mjolnir.client.getJoinedRooms();
        const permalink = Permalinks.parseUrl(roomRef);
        if (!permalink.roomIdOrAlias)
            return null;

        const roomId = await this.mjolnir.client.resolveRoom(permalink.roomIdOrAlias);
        if (!joinedRooms.includes(roomId)) {
            await this.mjolnir.client.joinRoom(roomId, permalink.viaServers);
        }

        if (this.policyLists.find(b => b.roomId === roomId)) {
            // This room was already in our list of policy rooms, nothing else to do.
            // Note that we bailout *after* the call to `joinRoom`, in case a user
            // calls `watchList` in an attempt to repair something that was broken,
            // e.g. a Mjölnir who could not join the room because of alias resolution
            // or server being down, etc.
            return null;
        }

        const list = await this.addPolicyList(roomId, roomRef);

        await this.storeMatixData();
        await this.warnAboutUnprotectedPolicyListRoom(roomId);

        return list;
    }

    public async unwatchList(roomRef: string): Promise<PolicyList | null> {
        const permalink = Permalinks.parseUrl(roomRef);
        if (!permalink.roomIdOrAlias)
            return null;

        const roomId = await this.mjolnir.client.resolveRoom(permalink.roomIdOrAlias);
        const list = this.policyLists.find(b => b.roomId === roomId) || null;
        if (list) {
            this.policyLists.splice(this.policyLists.indexOf(list), 1);
            this.mjolnir.ruleServer?.unwatch(list);
            this.mjolnir.protectedRoomsTracker.unwatchList(list);
        }

        await this.storeMatixData();
        return list;
    }

    protected async createFirstData(): Promise<RawSchemedData> {
        return { [SCHEMA_VERSION_KEY]: 0 };
    }

    protected async requestMatrixData(): Promise<unknown> {
        try {
            return await this.mjolnir.client.getAccountData(WATCHED_LISTS_EVENT_TYPE);
        } catch (e) {
            if (e.statusCode === 404) {
                LogService.warn('PolicyListManager', "Couldn't find account data for Mjolnir's watched lists, assuming first start.", e);
                return this.createFirstData();
            } else {
                throw e;
            }
        }
    }

    /**
     * Load the watched policy lists from account data, only used when Mjolnir is initialized.
     */
    public async start() {
        this.policyLists = [];
        const watchedListsEvent = await super.loadData();

        await Promise.all(
            (watchedListsEvent?.references || []).map(async (roomRef: string) => {
                const roomReference = await MatrixRoomReference.fromPermalink(roomRef).joinClient(this.mjolnir.client)
                    .catch(ex => {
                        LogService.error("PolicyListManager", "Failed to load watched lists for this mjolnir", ex);
                        return Promise.reject(ex);
                    }
                    );
                await this.warnAboutUnprotectedPolicyListRoom(roomReference.toRoomIdOrAlias());
                // TODO, FIXME: fix this so that it stores room references and not this utter junk.
                await this.addPolicyList(roomReference.toRoomIdOrAlias(), roomReference.toPermalink());
            })
        );
    }

    /**
     * Store to account the list of policy rooms.
     */
    protected async storeMatixData() {
        let list = this.policyLists.map(b => b.roomRef);
        await this.mjolnir.client.setAccountData(WATCHED_LISTS_EVENT_TYPE, {
            references: list,
        });
    }

    /**
     * Check whether a policy list room is protected. If not, display
     * a user-readable warning.
     *
     * We store as account data the list of room ids for which we have
     * already displayed the warning, to avoid bothering users at every
     * single startup.
     *
     * @param roomId The id of the room to check/warn.
     */
    private async warnAboutUnprotectedPolicyListRoom(roomId: string) {
        if (!this.mjolnir.config.protectAllJoinedRooms) {
            return; // doesn't matter
        }
        if (this.mjolnir.explicitlyProtectedRooms.includes(roomId)) {
            return; // explicitly protected
        }

        try {
            const accountData: { warned: boolean; } | null = await this.mjolnir.client.getAccountData(WARN_UNPROTECTED_ROOM_EVENT_PREFIX + roomId);
            if (accountData && accountData.warned) {
                return; // already warned
            }
        } catch (e) {
            // Expect that we haven't warned yet.
        }

        await this.mjolnir.managementRoomOutput.logMessage(LogLevel.WARN, "Mjolnir", `Not protecting ${roomId} - it is a ban list that this bot did not create. Add the room as protected if it is supposed to be protected. This warning will not appear again.`, roomId);
        await this.mjolnir.client.setAccountData(WARN_UNPROTECTED_ROOM_EVENT_PREFIX + roomId, { warned: true });
    }
}

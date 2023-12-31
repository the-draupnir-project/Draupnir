/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2022 The Matrix.org Foundation C.I.C.

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

import { StringRoomID, StringUserID } from "matrix-protection-suite";

export interface MjolnirRecord {
    local_part: string,
    owner: StringUserID,
    management_room: StringRoomID,
}

/**
 * Used to persist mjolnirs that have been provisioned by the mjolnir manager.
 */
export interface DataStore {
    /**
     * Initialize any resources that the datastore needs to function.
     */
    init(): Promise<void>;

    /**
     * Close any resources that the datastore is using.
     */
    close(): Promise<void>;

    /**
     * List all of the mjolnirs we have provisioned.
     */
    list(): Promise<MjolnirRecord[]>;

    /**
     * Persist a new `MjolnirRecord`.
     */
    store(mjolnirRecord: MjolnirRecord): Promise<void>;

    /**
     * @param owner The mxid of the user who provisioned this mjolnir.
     */
    lookupByOwner(owner: string): Promise<MjolnirRecord[]>;

    /**
     * @param localPart the mxid of the provisioned mjolnir.
     */
    lookupByLocalPart(localPart: string): Promise<MjolnirRecord[]>;
}

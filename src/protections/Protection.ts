/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 *
 * This file is modified and is NOT licensed under the Apache License.
 * This modified file incorperates work from mjolnir
 * https://github.com/matrix-org/mjolnir
 * which included the following license notice:

Copyright 2019 The Matrix.org Foundation C.I.C.

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

import { Mjolnir } from "../Mjolnir";
import { AbstractProtectionSetting } from "./ProtectionSettings";
import { Consequence } from "./consequence";
import { ReadItem } from "../commands/interface-manager/CommandReader";

/**
 * Represents a protection mechanism of sorts. Protections are intended to be
 * event-based (ie: X messages in a period of time, or posting X events).
 *
 * Protections are guaranteed to be run before redaction handlers.
 */
export abstract class Protection {
    abstract readonly name: string
    abstract readonly description: string;
    enabled = false;
    readonly requiredStatePermissions: string[] = [];
    abstract settings: { [setting: string]: AbstractProtectionSetting<any, any> };

    /*
     * Handle a single event from a protected room, to decide if we need to
     * respond to it
     */
    async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<Consequence[] | any> {
    }

    /*
     * Handle a single reported event from a protecte room, to decide if we
     * need to respond to it
     */
    async handleReport(mjolnir: Mjolnir, roomId: string, reporterId: string, event: any, reason?: string): Promise<any> {
    }

    /**
     * Return status information for `!mjolnir status ${protectionName}`.
     * FIXME: protections need their own tables https://github.com/Gnuxie/Draupnir/issues/21
     */
    async statusCommand(mjolnir: Mjolnir, subcommand: ReadItem[]): Promise<{html: string, text: string} | null> {
        // By default, protections don't have any status to show.
        return null;
    }

    /**
     * Allows protections to setup listeners when Mjolnir starts up.
     * @param mjolnir The mjolnir instance associated with a given protection manager.
     */
    public async registerProtection(mjolnir: Mjolnir): Promise<void> {
        return;
    }
}

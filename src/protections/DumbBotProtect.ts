/*
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { Protection } from "./Protection";
import { Mjolnir } from "../Mjolnir";
import { LogLevel, UserID } from "matrix-bot-sdk";
import { isTrueJoinEvent } from "../utils";
import { StringListProtectionSetting } from "./ProtectionSettings";

function isUserWithTrueDisplayname(userId: UserID, event: any): boolean {
    const displayname = event?.content?.displayname;
    if (displayname === undefined) {
        return false;
    } else if (userId.localpart === displayname) {
        return false;
    } else {
        return true;
    }
}

export class DumbBotProtect extends Protection {
    description = "Removes suspected burner accounts as they join a room.";
    settings = {
        safeServers: new StringListProtectionSetting()
    };

    constructor() {
        super()
        this.settings.safeServers.addValue('libera.chat');
    }

    public get name(): string {
        return 'DumbBotProtect';
    }

    public async handleEvent(mjolnir: Mjolnir, roomId: string, event: any): Promise<any> {
        if (event['type'] === 'm.room.member') {
            if (isTrueJoinEvent(event)) {
                const userId = new UserID(event['state_key']);
                if (!this.settings.safeServers.value.includes(userId.domain) &&
                    !isUserWithTrueDisplayname(userId, event) &&
                    event?.content?.avatar_url === undefined) {
                    mjolnir.client.kickUser(event['state_key'], roomId, 'Ongoing raid detected - please try again later.')
                    mjolnir.managementRoomOutput.logMessage(LogLevel.INFO, 'DumbBotProtect', `Kicking ${event['state_key']} from ${roomId}.`)
                }
            }
            return; // stop processing (membership event spam is another problem)
        }
        return;
    }
}

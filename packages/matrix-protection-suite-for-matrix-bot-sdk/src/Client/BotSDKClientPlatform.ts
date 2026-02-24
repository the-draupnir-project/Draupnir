// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ClientCapabilitiesNegotiation,
  ClientPlatform,
  RoomBanner,
  RoomCreator,
  RoomEventRedacter,
  RoomEventRelations,
  RoomInviter,
  RoomJoiner,
  RoomKicker,
  RoomMessages,
  RoomMessageSender,
  RoomResolver,
  RoomStateEventSender,
  RoomStateGetter,
  RoomUnbanner,
} from "matrix-protection-suite";
import { BotSDKBaseClient } from "./BotSDKBaseClient";
import { RoomReactionSender } from "matrix-protection-suite/dist/Client/RoomReactionSender";
import { RoomEventGetter } from "matrix-protection-suite/dist/Client/RoomEventGetter";

export class BotSDKClientPlatform implements ClientPlatform {
  constructor(private readonly allClient: BotSDKBaseClient) {
    // nothing to do,
  }

  toClientCapabilitiesNegotiation(): ClientCapabilitiesNegotiation {
    return this.allClient;
  }

  toRoomBanner(): RoomBanner {
    return this.allClient;
  }
  toRoomEventRedacter(): RoomEventRedacter {
    return this.allClient;
  }
  toRoomEventRelations(): RoomEventRelations {
    return this.allClient;
  }
  toRoomEventGetter(): RoomEventGetter {
    return this.allClient;
  }
  toRoomKicker(): RoomKicker {
    return this.allClient;
  }
  toRoomCreator(): RoomCreator {
    return this.allClient;
  }
  toRoomInviter(): RoomInviter {
    return this.allClient;
  }
  toRoomJoiner(): RoomJoiner {
    return this.allClient;
  }
  toRoomResolver(): RoomResolver {
    return this.allClient;
  }
  toRoomStateEventSender(): RoomStateEventSender {
    return this.allClient;
  }
  toRoomStateGetter(): RoomStateGetter {
    return this.allClient;
  }
  toRoomUnbanner(): RoomUnbanner {
    return this.allClient;
  }
  toRoomReactionSender(): RoomReactionSender {
    return this.allClient;
  }
  toRoomMessages(): RoomMessages {
    return this.allClient;
  }
  toRoomMessageSender(): RoomMessageSender {
    return this.allClient;
  }
}

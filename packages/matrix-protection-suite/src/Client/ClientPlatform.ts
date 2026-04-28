// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { ClientCapabilitiesNegotiation } from "./ClientCapabilityNegotiation";
import { RoomBanner } from "./RoomBanner";
import { RoomCreator } from "./RoomCreator";
import { RoomEventGetter } from "./RoomEventGetter";
import { RoomEventRedacter } from "./RoomEventRedacter";
import { RoomEventRelations } from "./RoomEventRelations";
import { RoomInviter } from "./RoomInviter";
import { RoomJoiner } from "./RoomJoiner";
import { RoomKicker } from "./RoomKicker";
import { RoomMessages } from "./RoomMessages";
import { RoomMessageSender } from "./RoomMessageSender";
import { RoomReactionSender } from "./RoomReactionSender";
import { RoomResolver } from "./RoomResolver";
import { RoomStateEventSender } from "./RoomStateEventSender";
import { RoomUnbanner } from "./RoomUnbanner";

/**
 * A `ClientPlatform` has all the capabilities associated with a client.
 * This might end up forming a tree in the future, where you go down to
 * narrow to attenuate furhter.
 * Very little should accept the entire client platform as an argument,
 * only the individual capabilities. An example situations where this would
 * be acceptable is a bot plugin platform itself that needs to setup lots
 * of dependencies.
 */
export interface ClientPlatform {
  toClientCapabilitiesNegotiation(): ClientCapabilitiesNegotiation;
  toRoomBanner(): RoomBanner;
  toRoomCreator(): RoomCreator;
  toRoomEventGetter(): RoomEventGetter;
  toRoomEventRedacter(): RoomEventRedacter;
  toRoomEventRelations(): RoomEventRelations;
  toRoomInviter(): RoomInviter;
  toRoomJoiner(): RoomJoiner;
  toRoomKicker(): RoomKicker;
  toRoomResolver(): RoomResolver;
  // TODO: honestly idk why we don't have a generic `event` sender that
  // we request for by event type.
  // It'd probably be worth bundling all room things together and modelling it
  // loosely after the power levels event structure (in the sense ban/unban are
  // seperate to events).
  toRoomReactionSender(): RoomReactionSender;
  // TODO: Ideally we'd accept allowed state types here, so we can easily attenuate
  // which types can be sent.
  toRoomStateEventSender(): RoomStateEventSender;
  toRoomUnbanner(): RoomUnbanner;
  toRoomMessages(): RoomMessages;
  toRoomMessageSender(): RoomMessageSender;
}

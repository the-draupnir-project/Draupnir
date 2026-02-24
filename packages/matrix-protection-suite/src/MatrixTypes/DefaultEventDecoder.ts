// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Value } from "../Interface/Value";
import {
  MJOLNIR_SHORTCODE_EVENT_TYPE,
  MjolnirShortcodeEvent,
} from "../PolicyList/PolicyListRevision";
import { SafeMembershipEventMirror } from "../SafeMatrixEvents/SafeMembershipEvent";
import { decodeEventWithUndecodableContent } from "../SafeMatrixEvents/UndecodableEventContent";
import { RoomCreateEvent } from "./CreateRoom";
import { StandardEventDecoder } from "./EventDecoder";
import { JoinRulesEvent } from "./JoinRules";
import { ALL_RULE_TYPES, PolicyRuleEvent } from "./PolicyEvents";
import { PowerLevelsEvent } from "./PowerLevels";
import { ReactionEvent } from "./ReactionEvent";
import { Redaction } from "./Redaction";
import { RoomMessage } from "./RoomMessage";
import { ServerACLEvent } from "./ServerACL";
import { TombstoneEvent } from "./Tombstone";

let eventDecoder = StandardEventDecoder.blankEventDecoder()
  .setDecoderForInvalidEventContent(decodeEventWithUndecodableContent)
  .setDecoderForEventType(MJOLNIR_SHORTCODE_EVENT_TYPE, (event) =>
    Value.Decode(MjolnirShortcodeEvent, event)
  )
  .setDecoderForEventType("m.reaction", (event) =>
    Value.Decode(ReactionEvent, event)
  )
  .setDecoderForEventType("m.room.create", (event) =>
    Value.Decode(RoomCreateEvent, event)
  )
  .setDecoderForEventType("m.room.redaction", (event) =>
    Value.Decode(Redaction, event)
  )
  .setDecoderForEventType("m.room.join_rules", (event) =>
    Value.Decode(JoinRulesEvent, event)
  )
  .setDecoderForEventType("m.room.member", SafeMembershipEventMirror.parseEvent)
  .setDecoderForEventType("m.room.message", (event) =>
    Value.Decode(RoomMessage, event)
  )
  .setDecoderForEventType("m.room.power_levels", (event) =>
    Value.Decode(PowerLevelsEvent, event)
  )
  .setDecoderForEventType("m.room.server_acl", (event) =>
    Value.Decode(ServerACLEvent, event)
  )
  .setDecoderForEventType("m.room.tombstone", (event) =>
    Value.Decode(TombstoneEvent, event)
  );

for (const type of ALL_RULE_TYPES) {
  eventDecoder = eventDecoder.setDecoderForEventType(type, function (event) {
    return Value.Decode(PolicyRuleEvent, event);
  });
}

export const DefaultEventDecoder = eventDecoder;

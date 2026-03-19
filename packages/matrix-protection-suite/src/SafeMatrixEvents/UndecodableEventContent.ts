// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { UnsafeEvent } from "./UnsafeEvent";
import { RoomEvent } from "../MatrixTypes/Events";
import { DecodeException, Value } from "../Interface/Value";
import { Type } from "@sinclair/typebox";
import { UnsafeContentKey } from "./SafeMembershipEvent";

export const UNDECODABLE_CONTENT_EVENT_TYPE = "me.marewolf.undecodable_content";

export interface UndecodableEvent extends UnsafeEvent {
  originalType: string;
}

const RoomEventWithUnknownContent = RoomEvent(Type.Unknown());

export function isUndecodableEvent(
  event: Record<string, unknown>
): event is UndecodableEvent & Record<string, unknown> {
  return (
    event.type === UNDECODABLE_CONTENT_EVENT_TYPE &&
    UnsafeContentKey in event &&
    typeof event.originalType === "string"
  );
}

export function decodeEventWithUndecodableContent(
  event: unknown
): Result<UndecodableEvent, DecodeException> {
  const decodeResult = Value.Decode(RoomEventWithUnknownContent, event);
  if (isError(decodeResult)) {
    return decodeResult;
  }
  const decodedEvent = decodeResult.ok;
  return Ok({
    ...decodedEvent,
    type: UNDECODABLE_CONTENT_EVENT_TYPE,
    originalType: decodedEvent.type,
    [UnsafeContentKey]: decodedEvent.content,
    content: {},
  });
}

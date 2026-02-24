// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ActionResult, Ok, isError, isOk } from "../Interface/Action";
import { DecodeException, Value } from "../Interface/Value";
import {
  BaseMembershipEvent,
  MembershipEventContent,
} from "../MatrixTypes/MembershipEvent";
import { ValuePointer } from "@sinclair/typebox/value";

/**
 * Used by the `SafeMembershipEventMirror` to extract unsafe content from an event.
 */
export const UnsafeContentKey = Symbol("unsafeContent");
/**
 * Used by the `SafeMembershipEventMirror` to determine if an object is `SafeMembershipEventContent`.
 */
const SafeMembershipEventContentKey = Symbol("SafeMembershipEventContent");

export interface SafeMembershipEventContent extends MembershipEventContent {
  [UnsafeContentKey]?: Record<string, unknown>;
  [SafeMembershipEventContentKey]: true;
}

export type SafeMembershipEvent = Omit<BaseMembershipEvent, "content"> & {
  content: SafeMembershipEventContent;
};

export const SafeMembershipEventMirror = Object.freeze({
  getUnsafeContent(
    content: SafeMembershipEventContent
  ): Record<string, unknown> | undefined {
    return content[UnsafeContentKey];
  },
  isSafeContent(content: unknown): content is SafeMembershipEventContent {
    return (
      typeof content === "object" &&
      content !== null &&
      SafeMembershipEventContentKey in content
    );
  },
  /**
   * Create `SafeMembershipEventContent` from valid content and unsafe content.
   */
  create(
    content: MembershipEventContent,
    {
      unsafeContent,
    }: {
      unsafeContent?: SafeMembershipEventContent[typeof UnsafeContentKey];
    } = {}
  ): SafeMembershipEventContent {
    return {
      ...content,
      ...{
        [SafeMembershipEventContentKey]: true,
      },
      ...(unsafeContent === undefined
        ? {}
        : { [UnsafeContentKey]: unsafeContent }),
    };
  },
  /**
   * Parse unknown membership content into safe membership content, if possible.
   * @param unknownContent unknown content.
   * @returns An ActionResult with the safe content, or a reason why safe content cannot be created.
   */
  parse(
    unknownContent: Record<string, unknown>
  ): ActionResult<SafeMembershipEventContent, DecodeException> {
    const decodeResult = Value.Decode(MembershipEventContent, unknownContent, {
      suppressLogOnError: true,
    });
    if (isOk(decodeResult)) {
      return Ok(this.create(decodeResult.ok));
    } else {
      const unsafePropertyKeys = decodeResult.error.errors.map(
        (error) => ValuePointer.Format(error.path).next().value as string
      );
      if (unsafePropertyKeys.includes("membership")) {
        // this is a legitimatly unsafe event.
        return decodeResult;
      }
      const safeContent = Object.fromEntries(
        Object.entries(unknownContent).filter(
          ([key]) => !unsafePropertyKeys.includes(key)
        )
      );
      const unsafeContent = Object.fromEntries(
        Object.entries(unknownContent).filter(([key]) =>
          unsafePropertyKeys.includes(key)
        )
      );
      return Ok(
        this.create(safeContent as MembershipEventContent, {
          unsafeContent,
        })
      );
    }
  },

  parseEvent(
    event: unknown
  ): ActionResult<SafeMembershipEvent, DecodeException> {
    const baseEventResult = Value.Decode(BaseMembershipEvent, event);
    if (isError(baseEventResult)) {
      return baseEventResult;
    }
    const safeContentResult = SafeMembershipEventMirror.parse(
      baseEventResult.ok.content
    );
    if (isError(safeContentResult)) {
      return safeContentResult;
    }
    const completeEvent = baseEventResult.ok;
    completeEvent.content = safeContentResult.ok;
    return Ok(completeEvent as SafeMembershipEvent);
  },
});

export type SafeMembershipEventMirror = typeof SafeMembershipEventMirror;

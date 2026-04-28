// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { StateEvent } from "../MatrixTypes/Events";

export enum StateChangeType {
  /**
   * A state event that has content has been introduced where no previous state type-key pair had
   * in the room's history. This also means where there are no previous redacted
   * or blanked state events.
   */
  Introduced = "Introduced",
  /**
   * A state event that has content has been reintroduced where a blank or redacted state type-key
   * pair had previously resided in the room state.
   * The distinction between introduced and reintroduced are important, because
   * an issuer can always treat introduced state in the timeline as a delta,
   * but not reintroduced, modified or removed state.
   */
  Reintroduced = "Reintroduced",
  /**
   * This is a special case of introduced, where a state type-key pair has been
   * introduced for the first time, but with empty content.
   */
  IntroducedAsBlank = "IntroducedAsBlank",
  /**
   * This is when a unique state event with empty content has been added
   * where there was previously a state event with empty or entirely redacted content.
   * Can alternatively be thought of as "ReintroducedAsEmpty".
   */
  BlankedEmptyContent = "BlankedEmptyContent",
  /**
   * A state event with empty content has been sent over a contentful event
   * with the same type-key pair.
   */
  BlankedContent = "BlankedContent",
  /**
   * A redaction was sent for an existing state event that is being tracked
   * and has removed all content keys.
   */
  CompletelyRedacted = "CompletelyRedacted",
  /**
   * A redaction was sent for an existing state event that is being tracked
   * and has removed all content keys that are not protected by authorization rules.
   * For example `membership` in a member event will not be removed.
   */
  PartiallyRedacted = "PartiallyRedacted",
  /**
   * There is an existing contentful state event for this type-key pair that has been replaced
   * with a new contenful state event.
   */
  SupersededContent = "SupersededContent",
  /**
   * The events are the same, and the event is intact.
   */
  NoChange = "NoChange",
}

function isSameEvent(eventA: StateEvent, eventB: StateEvent): boolean {
  return eventA.event_id === eventB.event_id;
}

function isEmptyOfContent(event: StateEvent): boolean {
  return Object.keys(event.content).length === 0;
}

function isDifferenceInContentKeys(
  eventA: StateEvent,
  eventB: StateEvent
): boolean {
  return (
    Object.keys(eventA.content).length !== Object.keys(eventB.content).length
  );
}

/**
 * Calculate the change in the room state.
 * This is used on a per event basis on state deltas or the result of `/state`.
 * If calculating the effects of a redaction, apply the redaction first and then
 * compare the original event with the redacted version.
 * @param event A new event for a state type-key pair.
 * @param existingState Any known existing state event for the type-key pair.
 * @returns How the state was changed @see StateChangeType.
 */
export function calculateStateChange(
  event: StateEvent,
  existingState?: StateEvent
): StateChangeType {
  if (isEmptyOfContent(event)) {
    if (existingState === undefined) {
      return StateChangeType.IntroducedAsBlank;
    } else if (isSameEvent(event, existingState)) {
      if (isEmptyOfContent(existingState)) {
        return StateChangeType.NoChange;
      } else {
        return StateChangeType.CompletelyRedacted;
      }
    } else if (isEmptyOfContent(existingState)) {
      return StateChangeType.BlankedEmptyContent;
    } else {
      return StateChangeType.BlankedContent;
    }
  } else if (existingState === undefined) {
    return StateChangeType.Introduced;
  } else if (isSameEvent(event, existingState)) {
    if (isDifferenceInContentKeys(event, existingState)) {
      return StateChangeType.PartiallyRedacted;
    } else {
      return StateChangeType.NoChange;
    }
  } else if (isEmptyOfContent(existingState)) {
    return StateChangeType.Reintroduced;
  } else {
    return StateChangeType.SupersededContent;
  }
}

export function isChanged(changeType: StateChangeType): boolean {
  return changeType !== StateChangeType.NoChange;
}

export function isChangingContent(changeType: StateChangeType): boolean {
  switch (changeType) {
    case StateChangeType.BlankedEmptyContent:
    case StateChangeType.IntroducedAsBlank:
    case StateChangeType.NoChange:
      return false;
    default:
      return true;
  }
}

// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { PolicyRuleEvent } from "../MatrixTypes/PolicyEvents";
import { PolicyRule } from "./PolicyRule";

export enum PolicyRuleChangeType {
  Added = "Added",
  Modified = "Modified",
  Removed = "Removed",
  RevealedLiteral = "RevealedLiteral",
}

/**
 * A way to guage the diff between two revisions.
 * @see {@link PolicyListRevision}.
 */
export interface PolicyRuleChange {
  readonly changeType: PolicyRuleChangeType;
  /**
   * State event that caused the change.
   * If the rule was redacted, this will be the redacted version of the event.
   */
  readonly event: PolicyRuleEvent;
  /**
   * The sender that caused the change.
   * The original event sender unless the change is because `event` was redacted. When the change is `event` being redacted
   * this will be the user who caused the redaction.
   */
  readonly sender: string;
  /**
   * The current rule represented by the event.
   * If the rule has been removed, then this will show what the rule was.
   */
  readonly rule: PolicyRule;
  /**
   * The previous state that has been changed. Only (and always) provided when the change type is `ChangeType.Removed` or `Modified`.
   * This will be a copy of the same event as `event` when a redaction has occurred and this will show its unredacted state.
   */
  readonly previousState?: PolicyRuleEvent;
  /**
   * If the rule has been modified, then this will be the previous version of the policy rule.
   */
  readonly previousRule?: PolicyRule;
}

// SPDX-FileCopyrightText: 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

/**
 * Used for keyword arguments (also known as "options", but this isn't specific enough as it could mean an optional argument).
 * For example `--force`.
 */
export class Keyword {
  /**
   * Creates a Keyword
   * @param designator The designator exluding hyphens.
   */
  constructor(public readonly designator: string) {
    // nothing to do.
  }
}

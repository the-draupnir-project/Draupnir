// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { decodeTime, monotonicFactory } from "ulidx";

/**
 * Represents a specific version of the state contained in `PolicyListRevision`.
 * These are unique and can be compared with `supersedes`.
 * We use a ULID to work out whether a revision supersedes another.
 * @see {@link PolicyListRevision}.
 */
export class Revision {
  /**
   * Ensures that ULIDs are monotonic.
   */
  private static makeULID = monotonicFactory();

  /**
   * Is only public for the comparison method,
   * I feel like I'm missing something here and it is possible without
   */
  public readonly ulid = Revision.makeULID();

  /**
   * Check whether this revision supersedes another revision.
   * @param revision The revision we want to check this supersedes.
   * @returns True if this Revision supersedes the other revision.
   */
  public supersedes(revision: Revision): boolean {
    return this.ulid > revision.ulid;
  }

  /**
   * The time that the revision was created in milliseconds.
   */
  public get time(): number {
    return decodeTime(this.ulid);
  }
}

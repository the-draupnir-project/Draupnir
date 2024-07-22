// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { StringRoomID, StringUserID } from "matrix-protection-suite";

export interface MjolnirRecord {
  local_part: string;
  owner: StringUserID;
  management_room: StringRoomID;
}

/**
 * Used to persist mjolnirs that have been provisioned by the mjolnir manager.
 */
export interface DataStore {
  /**
   * Initialize any resources that the datastore needs to function.
   */
  init(): Promise<void>;

  /**
   * Close any resources that the datastore is using.
   */
  close(): Promise<void>;

  /**
   * List all of the mjolnirs we have provisioned.
   */
  list(): Promise<MjolnirRecord[]>;

  /**
   * Persist a new `MjolnirRecord`.
   */
  store(mjolnirRecord: MjolnirRecord): Promise<void>;

  /**
   * @param owner The mxid of the user who provisioned this mjolnir.
   */
  lookupByOwner(owner: string): Promise<MjolnirRecord[]>;

  /**
   * @param localPart the mxid of the provisioned mjolnir.
   */
  lookupByLocalPart(localPart: string): Promise<MjolnirRecord[]>;
}

// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import AwaitLock from "await-lock";
import {
  Logger,
  StandardRoomStateRevisionIssuer,
} from "matrix-protection-suite";

const log = new Logger("RoomStateRefresh");

/**
 * Basically we want to be able to control the rate at which we refresh room
 * state because it can overwhelm servers if we request all the room state
 * at once. Currently we just use a simple lock to make sure that it happens
 * sequentially.
 */
export class RoomStateRefresh {
  private sequentialLock = new AwaitLock();

  private async refreshStateAsync(
    issuer: StandardRoomStateRevisionIssuer
  ): Promise<void> {
    await this.sequentialLock.acquireAsync();
    try {
      log.debug(
        `Refreshing room state for the room: ${issuer.room.toPermalink()}`
      );
      await issuer.refreshRoomState();
    } finally {
      this.sequentialLock.release();
    }
  }
  public refreshState(issuer: StandardRoomStateRevisionIssuer): void {
    void this.refreshStateAsync(issuer);
  }
}

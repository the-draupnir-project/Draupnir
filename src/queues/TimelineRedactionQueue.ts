// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  MatrixGlob,
  StringEventID,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  KeyedBatchQueue,
  Logger,
  RoomEventRedacter,
  RoomMessages,
} from "matrix-protection-suite";

const log = new Logger("TimelineRedactionQueue");

export class TimelineRedactionQueue {
  private readonly batchProcessor = this.processBatch.bind(this);
  private readonly queue = new KeyedBatchQueue<StringRoomID, StringUserID>(
    this.batchProcessor
  );

  public constructor(
    private readonly roomMessages: RoomMessages,
    private readonly roomEventRedacter: RoomEventRedacter,
    // FIXME: We really should have a way of adding a limit to the batch enqueue operation...
    // It doesn't really seem possible though. Unless the maximum limit anyone enqueues is chosen.
    // Yeah that sounds like how it would have to work. Meanwhile, it doesn't really matter since
    // the current behaviour is constrained to 1000.
    private readonly limit = 1000
  ) {
    // nothing to do.
  }
  private async processBatch(
    roomID: StringRoomID,
    userIDs: StringUserID[]
  ): Promise<Result<void>> {
    const globUserIDs = userIDs.filter(
      (userID) => userID.includes("*") || userID.includes("?")
    );
    const globsToTest = globUserIDs.map((userID) => new MatrixGlob(userID));
    const isGlobInUsers = globsToTest.length !== 0;
    const usersToTest = userIDs.filter(
      (userID) => !globUserIDs.includes(userID)
    );
    const paginator = this.roomMessages.toRoomMessagesIterator(roomID, {
      direction: "backwards",
      limit: this.limit,
      ...(isGlobInUsers ? {} : { filter: { senders: userIDs } }),
    });
    const eventsToRedact: StringEventID[] = [];
    const paginationResult = await paginator.forEachItem({
      forEachItemCB: (event) => {
        if (
          // Always add users when there are no globs, since events are filtered by sender.
          !isGlobInUsers ||
          usersToTest.includes(event.sender) ||
          globsToTest.some((glob) => glob.test(event.sender))
        ) {
          eventsToRedact.push(event.event_id);
        }
      },
      totalItemLimit: this.limit,
    });
    if (isError(paginationResult)) {
      return paginationResult.elaborate(
        `Failed to paginate /messages in ${roomID} to begin redaction`
      );
    }
    // TODO: It would be good if we had a way of throttling these requests
    // per draupnir and in general but y'know.
    for (const eventID of eventsToRedact) {
      const redactResult = await this.roomEventRedacter.redactEvent(
        roomID,
        eventID
      );
      if (isError(redactResult)) {
        log.error(
          `Error while trying to redact messages for in ${roomID}:`,
          eventID,
          redactResult.error
        );
      }
    }
    return Ok(undefined);
  }

  public async enqueueRedaction(
    userID: StringUserID,
    roomID: StringRoomID
  ): Promise<Result<void>> {
    return await this.queue.enqueue(roomID, userID);
  }
}

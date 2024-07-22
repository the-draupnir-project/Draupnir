// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { LogLevel } from "matrix-bot-sdk";
import { redactUserMessagesIn } from "../utils";
import ManagementRoomOutput from "../ManagementRoomOutput";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  ActionExceptionKind,
  MatrixRoomReference,
  RoomUpdateError,
  RoomUpdateException,
  StringRoomID,
  StringUserID,
} from "matrix-protection-suite";

export interface QueuedRedaction {
  /** The room which the redaction will take place in. */
  readonly roomID: StringRoomID;
  /**
   * Carry out the redaction.
   * Called by the EventRedactionQueue.
   * @param client A MatrixClient to use to carry out the redaction.
   */
  redact(
    client: MatrixSendClient,
    managementRoom: ManagementRoomOutput
  ): Promise<void>;
  /**
   * Used to test whether the redaction is the equivalent to another redaction.
   * @param redaction Another QueuedRedaction to test if this redaction is an equivalent to.
   */
  redactionEqual(redaction: QueuedRedaction): boolean;
}

/**
 * Redacts all of the messages a user has sent to one room.
 */
export class RedactUserInRoom implements QueuedRedaction {
  constructor(
    public readonly userID: StringUserID,
    public readonly roomID: StringRoomID
  ) {}

  public async redact(
    client: MatrixSendClient,
    managementRoom: ManagementRoomOutput
  ) {
    await managementRoom.logMessage(
      LogLevel.DEBUG,
      "Mjolnir",
      `Redacting events from ${this.userID} in room ${this.roomID}.`
    );
    await redactUserMessagesIn(client, managementRoom, this.userID, [
      this.roomID,
    ]);
  }

  public redactionEqual(redaction: QueuedRedaction): boolean {
    if (redaction instanceof RedactUserInRoom) {
      return (
        redaction.userID === this.userID && redaction.roomID === this.roomID
      );
    } else {
      return false;
    }
  }
}
/**
 * This is a queue for events so that other protections can happen first (e.g. applying room bans to every room).
 */
export class EventRedactionQueue {
  /**
   * This map is indexed by roomId and its values are a list of redactions waiting to be processed for that room.
   */
  private toRedact: Map<string, QueuedRedaction[]> = new Map<
    string,
    QueuedRedaction[]
  >();

  /**
   * Test whether the redaction is already present in the queue.
   * @param redaction a QueuedRedaction.
   * @returns True if the queue already has the redaction, false otherwise.
   */
  public has(redaction: QueuedRedaction): boolean {
    return !!this.toRedact
      .get(redaction.roomID)
      ?.find((r) => r.redactionEqual(redaction));
  }

  /**
   * Adds a `QueuedRedaction` to the queue. It will be processed when `process` is called.
   * @param redaction A `QueuedRedaction` to await processing
   * @returns `true` if the redaction was added to the queue, `false` if it is a duplicate of a redaction already present in the queue.
   */
  public add(redaction: QueuedRedaction): boolean {
    if (this.has(redaction)) {
      return false;
    } else {
      const entry = this.toRedact.get(redaction.roomID);
      if (entry) {
        entry.push(redaction);
      } else {
        this.toRedact.set(redaction.roomID, [redaction]);
      }
      return true;
    }
  }

  /**
   * Process the redaction queue, carrying out the action of each `QueuedRedaction` in sequence.
   * If a redaction cannot be processed, the redaction is skipped and removed from the queue.
   * We then carry on processing the next redactions.
   * The reason we skip is at the moment is that we would have to think about all of the situations
   * where we would not want failures to try again (e.g. messages were already redacted) and handle them explicitly.
   * @param client The matrix client to use for processing redactions.
   * @param limitToRoomId If the roomId is provided, only redactions for that room will be processed.
   * @returns A description of any errors encountered by each QueuedRedaction that was processed.
   */
  public async process(
    client: MatrixSendClient,
    managementRoom: ManagementRoomOutput,
    limitToRoomID?: StringRoomID
  ): Promise<RoomUpdateError[]> {
    const errors: RoomUpdateError[] = [];
    const redact = async (currentBatch: QueuedRedaction[]) => {
      for (const redaction of currentBatch) {
        try {
          await redaction.redact(client, managementRoom);
        } catch (e) {
          const message = e.message || (e.body ? e.body.error : "<no message>");
          const error = new RoomUpdateException(
            MatrixRoomReference.fromRoomID(redaction.roomID),
            ActionExceptionKind.Unknown,
            e,
            message
          );
          errors.push(error);
        }
      }
    };
    if (limitToRoomID) {
      // There might not actually be any queued redactions for this room.
      const queuedRedactions = this.toRedact.get(limitToRoomID);
      if (queuedRedactions) {
        this.toRedact.delete(limitToRoomID);
        await redact(queuedRedactions);
      }
    } else {
      for (const [roomId, redactions] of this.toRedact) {
        this.toRedact.delete(roomId);
        await redact(redactions);
      }
    }
    return errors;
  }
}

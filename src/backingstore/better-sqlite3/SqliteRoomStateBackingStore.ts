// Copyright (C) 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  EventDecoder,
  Logger,
  Ok,
  RoomStateBackingStore,
  RoomStateRevision,
  StateChange,
  StateEvent,
  isError,
} from "matrix-protection-suite";
import { BetterSqliteStore, flatTransaction } from "./BetterSqliteStore";
import { jsonReviver } from "../../utils";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import path from "path";

const log = new Logger("SqliteRoomStateBackingStore");

const schema = [
  `CREATE TABLE room_info (
        room_id TEXT PRIMARY KEY NOT NULL,
        last_complete_writeback INTEGER NOT NULL
    ) STRICT;`,
  `CREATE TABLE room_state_event (
        room_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        state_key TEXT NOT NULL,
        event BLOB NOT NULL,
        PRIMARY KEY (room_id, event_type, state_key),
        FOREIGN KEY (room_id) REFERENCES room_info(room_id)
    ) STRICT;`,
];

type RoomStateEventReplaceValue = [StringRoomID, string, string, string];

type RoomInfo = { last_complete_writeback: number; room_id: StringRoomID };

export class SqliteRoomStateBackingStore
  extends BetterSqliteStore
  implements RoomStateBackingStore
{
  private readonly roomInfoMap = new Map<StringRoomID, RoomInfo>();
  public readonly revisionListener = this.handleRevision.bind(this);
  public constructor(
    path: string,
    private readonly eventDecoder: EventDecoder
  ) {
    super(
      schema.map(
        (text) =>
          function (db) {
            db.prepare(text).run();
          }
      ),
      {
        path,
        fileMustExist: false,
      }
    );
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("temp_store = file"); // Avoid unnecessary memory usage.
    this.ensureSchema();
  }

  public static create(
    storagePath: string,
    eventDecoder: EventDecoder
  ): SqliteRoomStateBackingStore {
    return new SqliteRoomStateBackingStore(
      path.join(storagePath, "room-state-backing-store.db"),
      eventDecoder
    );
  }

  private updateBackingStore(
    revision: RoomStateRevision,
    changes: StateChange[]
  ): void {
    const roomMetaStatement = this.db.prepare(
      `REPLACE INTO room_info VALUES(?, ?)`
    );
    const replaceStatement = this.db.prepare(
      `REPLACE INTO room_state_event VALUES(?, ?, ?, jsonb(?))`
    );
    const createValue = (event: StateEvent): RoomStateEventReplaceValue => {
      return [
        event.room_id,
        event.type,
        event.state_key,
        JSON.stringify(event),
      ];
    };
    // `flatTransaction` optimizes away unnecessary temporary files.
    const replace = flatTransaction(this.db, (events: StateEvent[]) => {
      for (const event of events) {
        replaceStatement.run(createValue(event));
      }
    });
    const doCompleteWriteback = this.db.transaction(() => {
      const info: RoomInfo = {
        room_id: revision.room.toRoomIDOrAlias(),
        last_complete_writeback: Date.now(),
      };
      roomMetaStatement.run(info.room_id, info.last_complete_writeback);
      replace(revision.allState);
      this.roomInfoMap.set(info.room_id, info);
    });
    const roomInfo = this.getRoomMeta(revision.room.toRoomIDOrAlias());
    if (roomInfo === undefined) {
      try {
        doCompleteWriteback();
      } catch (e) {
        log.error(
          `Unable to create initial room state for ${revision.room.toPermalink()} into the room state backing store`,
          e
        );
      }
    } else {
      try {
        replace(changes.map((change) => change.state));
      } catch (e) {
        log.error(
          `Unable to update the room state for ${revision.room.toPermalink()} as a result of ${changes.length} changes`,
          e
        );
      }
    }
  }

  public handleRevision(
    revision: RoomStateRevision,
    changes: StateChange[]
  ): void {
    try {
      this.updateBackingStore(revision, changes);
    } catch (e) {
      log.error(
        `Unable to update the backing store for revision of the room ${revision.room.toPermalink()}`,
        e
      );
    }
  }

  private getRoomMeta(roomID: StringRoomID): RoomInfo | undefined {
    const entry = this.roomInfoMap.get(roomID);
    if (entry) {
      return entry;
    } else {
      const dbEntry = this.db
        .prepare(`SELECT * FROM room_info WHERE room_id = ?`)
        .get(roomID) as RoomInfo | undefined;
      if (dbEntry === undefined) {
        return dbEntry;
      }
      this.roomInfoMap.set(roomID, dbEntry);
      return dbEntry;
    }
  }

  public getRoomState(
    roomID: StringRoomID
  ): Promise<ActionResult<StateEvent[] | undefined>> {
    const roomInfo = this.getRoomMeta(roomID);
    if (roomInfo === undefined) {
      return Promise.resolve(Ok(undefined));
    } else {
      const events = [];
      for (const event of this.db
        .prepare(`SELECT json(event) FROM room_state_event WHERE room_id = ?`)
        .pluck()
        .iterate(roomID) as IterableIterator<string>) {
        const rawJson = JSON.parse(event, jsonReviver);
        // We can't trust what's in the store, because our event decoders might have gotten
        // stricter in more recent versions. Meaning the store could have invalid events
        // that we don't want to blindly intern.
        const decodedEvent = this.eventDecoder.decodeStateEvent(rawJson);
        if (isError(decodedEvent)) {
          log.error(`Unable to decode event from store:`, decodedEvent.error);
          continue;
        } else {
          events.push(decodedEvent.ok);
        }
      }
      return Promise.resolve(Ok(events));
    }
  }

  public forgetRoom(roomID: StringRoomID): Promise<ActionResult<void>> {
    const deleteMetaStatement = this.db.prepare(
      `DELETE FROM room_info WHERE room_id = ?`
    );
    const deleteStateStatement = this.db.prepare(
      `DELETE FROM room_state_event WHERE room_id = ?`
    );
    const deleteRoom = this.db.transaction(() => {
      deleteMetaStatement.run(roomID);
      deleteStateStatement.run(roomID);
    });
    try {
      deleteRoom();
    } catch (e) {
      return Promise.resolve(
        ActionException.Result(`Unable to forget the room ${roomID}`, {
          exception: e,
          exceptionKind: ActionExceptionKind.Unknown,
        })
      );
    }
    return Promise.resolve(Ok(undefined));
  }

  public async forgetAllRooms(): Promise<ActionResult<void>> {
    for (const roomID of this.roomInfoMap.keys()) {
      const result = await this.forgetRoom(roomID);
      if (isError(result)) {
        return result;
      }
    }
    return Ok(undefined);
  }
}

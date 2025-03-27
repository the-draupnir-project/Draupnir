// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import Database from "better-sqlite3";
import { BetterSqliteOptions } from "../../../src/backingstore/better-sqlite3/BetterSqliteStore";
import { SqliteRoomStateBackingStore } from "../../../src/backingstore/better-sqlite3/SqliteRoomStateBackingStore";
import {
  DefaultEventDecoder,
  describeProtectedRoomsSet,
  describeRoomMember,
  Membership,
  PolicyRuleType,
  PowerLevelsEventContent,
  randomRoomID,
  Recommendation,
} from "matrix-protection-suite";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { FakeRoomStateRevisionIssuer } from "matrix-protection-suite/dist/StateTracking/FakeRoomStateRevisionIssuer";
import expect from "expect";

function makeStore(): SqliteRoomStateBackingStore {
  const options = { path: ":memory:" } satisfies BetterSqliteOptions;
  const db = new Database(options.path);
  db.pragma("FOREIGN_KEYS = ON");
  return new SqliteRoomStateBackingStore(options, db, DefaultEventDecoder);
}

describe("RoomStateBackingStore", function () {
  it("dumps and reloads revisions correctly", async function () {
    const DraupnirUserID = StringUserID("@draupnir:example.com");
    const exampleRoom = randomRoomID([]);
    const { roomStateManager } = await describeProtectedRoomsSet({
      rooms: [
        {
          room: exampleRoom,
          policyDescriptions: [
            {
              entity: "@existing-spam:spam.example.com",
              recommendation: Recommendation.Ban,
              type: PolicyRuleType.User,
            },
          ],
          stateDescriptions: [
            {
              sender: DraupnirUserID,
              type: "m.room.power_levels",
              state_key: "",
              content: {
                users: {
                  [DraupnirUserID]: 100,
                },
              } satisfies PowerLevelsEventContent,
            },
          ],
        },
      ],
    });
    const store = makeStore();
    const roomStateRevisionIssuer = (
      await roomStateManager.getRoomStateRevisionIssuer(exampleRoom)
    ).expect(
      "should be able to get this revision issuer mare"
    ) as FakeRoomStateRevisionIssuer;
    roomStateRevisionIssuer.on("revision", (revision, changes) => {
      store.handleRevision(revision, changes);
    });
    roomStateRevisionIssuer.appendState([
      describeRoomMember({
        sender: DraupnirUserID,
        room_id: exampleRoom.toRoomIDOrAlias(),
        membership: Membership.Join,
      }),
    ]);
    const storedState = (
      await store.getRoomState(exampleRoom.toRoomIDOrAlias())
    ).expect("Should be able to get the store state");
    expect(storedState?.length).toBe(3);
    expect(
      storedState?.find((event) => event.type === "m.room.power_levels")
    ).toBeTruthy();
    expect(
      storedState?.find((event) => event.type === "m.room.member")
    ).toBeTruthy();
  });
  it("Can do legacy transition mare", async function () {
    const options = { path: ":memory:" } satisfies BetterSqliteOptions;
    const db = new Database(options.path);
    db.pragma("FOREIGN_KEYS = ON");
    // This is not the real former schema, because they are the same
    // it's just differnt on purpose
    db.exec(`
      CREATE TABLE room_info (
        room_id TEXT PRIMARY KEY NOT NULL
      ) STRICT, WITHOUT ROWID;
      CREATE TABLE room_state_event (
        room_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        state_key TEXT NOT NULL,
        PRIMARY KEY (room_id, event_type, state_key),
        FOREIGN KEY (room_id) REFERENCES room_info(room_id)
      ) STRICT;
      CREATE TABLE schema (
        version INTEGER NOT NULL
      ) STRICT;`);
    const room = randomRoomID([]);
    db.prepare(`INSERT INTO room_info VALUES (?)`).run(room.toRoomIDOrAlias());
    db.prepare(`INSERT INTO room_state_event VALUES (?, ?, ?)`).run(
      room.toRoomIDOrAlias(),
      "foo",
      ""
    );
    const store = new SqliteRoomStateBackingStore(
      options,
      db,
      DefaultEventDecoder
    );
    expect(
      (await store.getRoomState(room.toRoomIDOrAlias())).expect(
        "Should be able to get this"
      )
    ).toBe(undefined);
  });
});

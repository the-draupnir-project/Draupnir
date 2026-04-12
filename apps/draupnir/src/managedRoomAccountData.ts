// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Type } from "@sinclair/typebox";
import { EDStatic, StringRoomIDSchema } from "matrix-protection-suite";
import {
  BotSDKMatrixAccountData,
  MatrixSendClient,
} from "matrix-protection-suite-for-matrix-bot-sdk";

export const MANAGEMENT_ROOM_ACCOUNT_DATA_EVENT_TYPE =
  "space.draupnir.management_room";
export const ADMIN_ROOM_ACCOUNT_DATA_EVENT_TYPE = "space.draupnir.admin_room";

export const ManagedRoomAccountDataRecordSchema = Type.Object({
  room_id: StringRoomIDSchema,
});

export type ManagedRoomAccountDataRecord = EDStatic<
  typeof ManagedRoomAccountDataRecordSchema
>;

export function makeManagedRoomAccountDataStore(
  client: MatrixSendClient,
  eventType: string
): BotSDKMatrixAccountData<ManagedRoomAccountDataRecord> {
  return new BotSDKMatrixAccountData(
    eventType,
    ManagedRoomAccountDataRecordSchema,
    client
  );
}

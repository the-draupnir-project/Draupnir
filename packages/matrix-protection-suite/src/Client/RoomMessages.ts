// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import { RoomEvent } from "../MatrixTypes/Events";
import { MatrixPaginator } from "./Pagination/MatrixPaginator";
import { PaginationOptions } from "./Pagination/PaginationOptions";
import { RoomEventFilter } from "./RoomEventFilter";
import { PaginationIterator } from "./Pagination/PaginationIteration";
import { Type } from "@sinclair/typebox";
import { StringPaginationTokenSchema } from "./Pagination/PaginationToken";

export interface RoomMessagesOptions extends PaginationOptions {
  filter?: RoomEventFilter;
}

// We're specialising a type parameter.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RoomMessagesPaginator<
  TEvent extends RoomEvent = RoomEvent,
> extends MatrixPaginator<TEvent, RoomMessagesOptions> {}

export interface RoomMessages {
  toRoomMessagesPaginator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID
  ): RoomMessagesPaginator<TEvent>;

  toRoomMessagesIterator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID,
    options?: RoomMessagesOptions
  ): PaginationIterator<TEvent>;
}

export const RoomMessagesResponse = Type.Object({
  chunk: Type.Array(Type.Unknown()),
  start: StringPaginationTokenSchema,
  end: Type.Optional(StringPaginationTokenSchema),
});

// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringEventID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomEvent } from "../MatrixTypes/Events";
import { MatrixPaginator } from "./Pagination/MatrixPaginator";
import { PaginationOptions } from "./Pagination/PaginationOptions";
import { PaginationIterator } from "./Pagination/PaginationIteration";
import { Type } from "@sinclair/typebox";
import { StringPaginationTokenSchema } from "./Pagination/PaginationToken";

export interface RoomEventRelationsOptions extends PaginationOptions {
  relationType?: string;
  eventType?: string;
}

export interface RoomEventRelationsPaginator<
  TEvent extends RoomEvent = RoomEvent,
> extends MatrixPaginator<TEvent, RoomEventRelationsOptions> {}

export interface RoomEventRelations {
  toRoomEventRelationsPaginator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID,
    eventID: StringEventID
  ): RoomEventRelationsPaginator<TEvent>;

  toRoomEventRelationsIterator<TEvent extends RoomEvent = RoomEvent>(
    roomID: StringRoomID,
    eventID: StringEventID,
    options: RoomEventRelationsOptions
  ): PaginationIterator<TEvent>;
}

export const RoomEventRelationsResponse = Type.Object({
  chunk: Type.Array(Type.Unknown()),
  next_batch: Type.Optional(StringPaginationTokenSchema),
  prev_batch: Type.Optional(StringPaginationTokenSchema),
});

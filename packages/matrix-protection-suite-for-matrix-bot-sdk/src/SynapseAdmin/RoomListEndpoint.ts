// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import { EDStatic } from "matrix-protection-suite";
import { RoomDetailsResponse } from "./RoomDetailsEndpoint";

export interface RoomListQueryParams {
  from?: number; // Offset in the returned list, defaults to 0
  limit?: number; // Maximum amount of rooms to return, defaults to 100
  order_by?:
    | "alphabetical"
    | "size"
    | "name"
    | "canonical_alias"
    | "joined_members"
    | "joined_local_members"
    | "version"
    | "creator"
    | "encryption"
    | "federatable"
    | "public"
    | "join_rules"
    | "guest_access"
    | "history_visibility"
    | "state_events"; // Sorting method, defaults to "name"
  dir?: "f" | "b"; // Direction of sorting, defaults to "f"
  search_term?: string; // Filter for room name, alias, or ID
  public_rooms?: boolean; // Optional flag to filter public rooms
  empty_rooms?: boolean; // Optional flag to filter empty rooms
}

export type RoomListResponse = EDStatic<typeof RoomListResponse>;
export const RoomListResponse = Type.Object(
  {
    rooms: Type.Array(RoomDetailsResponse, {
      description:
        "An array of objects, each containing information about a room.",
    }),
    offset: Type.Optional(
      Type.Union([
        Type.Number({ description: "The current pagination offset in rooms." }),
        Type.Null(),
      ])
    ),
    total_rooms: Type.Optional(
      Type.Union([
        Type.Number({
          description: "The total number of rooms returned.",
        }),
        Type.Null(),
      ])
    ),
    next_batch: Type.Optional(
      Type.Union([
        Type.Number({ description: "Token to get the next page of results." }),
        Type.Null(),
      ])
    ),
    prev_batch: Type.Optional(
      Type.Union([
        Type.Number({
          description: "Token to get the previous page of results.",
        }),
        Type.Null(),
      ])
    ),
  },
  {
    description:
      "The JSON response body containing room listings and pagination information.",
  }
);

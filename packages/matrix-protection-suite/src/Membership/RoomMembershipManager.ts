// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StaticDecode } from "@sinclair/typebox";
import { ActionResult } from "../Interface/Action";
import { MembershipEvent } from "../MatrixTypes/MembershipEvent";
import { RoomMembershipRevisionIssuer } from "./MembershipRevisionIssuer";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";

// NOTE: This isn't going to be used to query about a set of rooms
//       a propagator version of the revision should be used for that.
export interface RoomMembershipManager {
  getRoomMembershipRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<RoomMembershipRevisionIssuer>>;

  getRoomMembershipEvents(
    room: MatrixRoomID
  ): Promise<ActionResult<StaticDecode<typeof MembershipEvent>[]>>;
}

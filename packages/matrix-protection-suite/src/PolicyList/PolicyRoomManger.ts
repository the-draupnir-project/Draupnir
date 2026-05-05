// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { RoomCreateOptions } from "../MatrixTypes/CreateRoom";
import { ActionResult } from "../Interface/Action";
import { PolicyRuleEvent, PolicyRuleType } from "../MatrixTypes/PolicyEvents";
import { PolicyRoomRevisionIssuer } from "./PolicyListRevisionIssuer";
import { PolicyRoomEditor } from "./PolicyRoomEditor";
import {
  MatrixRoomID,
  MatrixRoomReference,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";

/**
 * An interface to access models of a `PolicyRoom` (a PolicyList which is a direct
 * representation of a Matrix room).
 */
export interface PolicyRoomManager {
  /**
   * Create a new Matrix room that will be used as a Policy Room.
   * @param shortcode A short name for the room that can be used by a user to refer to the room.
   * @param invite A list of users to invite to the room.
   * @param createRoomOptions Any additional options that should be incorperated into the create event.
   * @returns A reference to the newly created Matrix room.
   */
  createPolicyRoom(
    shortcode: string,
    invite: string[],
    createRoomOptions: RoomCreateOptions
  ): Promise<ActionResult<MatrixRoomID>>;

  /**
   * Get a `PolicyRoomRevisionIssuer` for a Matrix room, that will issue updates
   * to the current revision.
   * @param room A Matrix room ID for the PolicyRoom.
   * @returns A PolicyRoomRevisionIssuer.
   * @see {@link PolicyRoomRevisionIssuer}.
   */
  getPolicyRoomRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomRevisionIssuer>>;

  /**
   * Get a `PolicyRoomEditor` for a Matrix room.
   * @param room A MatrixRoomID referring to a room that will be edited.
   * @returns A `PolicyRoomEditor` that can be used to edit policies in the room.
   */
  getPolicyRoomEditor(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomEditor>>;

  /**
   * Fetch the `PolicyRuleEvent` events from a Marix room.
   * @param room A MatrixRoomReference.
   * @returns The PolicyRuleEvents that are enacted in the room.
   */
  getPolicyRuleEvents(
    room: MatrixRoomReference
  ): Promise<ActionResult<PolicyRuleEvent[]>>;

  getEditablePolicyRoomIDs(
    editor: StringUserID,
    ruleType: PolicyRuleType
  ): MatrixRoomID[];
}

// Copyright (C) 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  StringRoomID,
  MatrixRoomID,
  MatrixRoomReference,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { ActionError, ActionResult, Ok } from "../Interface/Action";
import { RoomCreateOptions } from "../MatrixTypes/CreateRoom";
import { PolicyRuleEvent, PolicyRuleType } from "../MatrixTypes/PolicyEvents";
import { FakePolicyRoomRevisionIssuer } from "../PolicyList/FakePolicyRoomRevisionIssuer";
import { PolicyRoomRevisionIssuer } from "../PolicyList/PolicyListRevisionIssuer";
import { PolicyRoomEditor } from "../PolicyList/PolicyRoomEditor";
import { PolicyRoomManager } from "../PolicyList/PolicyRoomManger";

export class FakePolicyRoomManager implements PolicyRoomManager {
  private readonly policyRoomRevisionIssuers = new Map<
    StringRoomID,
    FakePolicyRoomRevisionIssuer
  >();

  public constructor(
    policyRoomRevisionIssuers: FakePolicyRoomRevisionIssuer[] = []
  ) {
    for (const issuer of policyRoomRevisionIssuers) {
      this.policyRoomRevisionIssuers.set(issuer.room.toRoomIDOrAlias(), issuer);
    }
  }

  public async createPolicyRoom(
    _shortcode: string,
    _invite: string[],
    _createRoomOptions: RoomCreateOptions
  ): Promise<ActionResult<MatrixRoomID>> {
    // Strictly, this isn't true, but i don't think we're going to use this.
    throw new TypeError(
      `The FakePolicyRoomManager is undable to create a policy room`
    );
  }

  public async getPolicyRoomRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomRevisionIssuer>> {
    const issuer = this.policyRoomRevisionIssuers.get(room.toRoomIDOrAlias());
    if (issuer === undefined) {
      return ActionError.Result(
        `Cannot find the room ${room.toRoomIDOrAlias()}`
      );
    }
    return Ok(issuer);
  }

  public async getPolicyRoomEditor(
    _room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomEditor>> {
    // Strictly this isn't true either, it could do this if we could keep track of the
    // issuers and had access to the room state revision issuer.
    throw new TypeError(
      `The FakePolicyRoomManager is unable to obtain an editor for a policy room`
    );
  }

  public async getPolicyRuleEvents(
    _room: MatrixRoomReference
  ): Promise<ActionResult<PolicyRuleEvent[]>> {
    throw new TypeError(
      `The FakePolicyRoomManager is unable to obtain the policy rule events for a policy room`
    );
  }

  public getEditablePolicyRoomIDs(
    _editor: StringUserID,
    _ruleType: PolicyRuleType
  ): MatrixRoomID[] {
    // strictly speaking, it probably can releatively easily.
    throw new TypeError(
      `The StubPolicyRoomManager is unable to determine which policy rooms are editable`
    );
  }

  // These methods are on the fake side of the policy room manager.
  public getFakePolicyRoomRevisionIssuer(
    room: MatrixRoomID
  ): FakePolicyRoomRevisionIssuer {
    const issuer = this.policyRoomRevisionIssuers.get(room.toRoomIDOrAlias());
    if (issuer === undefined) {
      throw new TypeError(
        `You haven't yet given the room ${room.toPermalink()} to the FakePolicyRevisionIssuer`
      );
    }
    return issuer;
  }

  public addIssuer(issuer: FakePolicyRoomRevisionIssuer): void {
    this.policyRoomRevisionIssuers.set(issuer.room.toRoomIDOrAlias(), issuer);
  }
}

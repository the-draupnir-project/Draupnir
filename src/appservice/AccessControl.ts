// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  MatrixRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ActionResult,
  EntityAccess,
  Ok,
  PolicyListRevisionIssuer,
  PolicyRoomManager,
  isError,
  AccessControl as MPSAccess,
  PolicyRoomEditor,
  PolicyRuleType,
  Recommendation,
  RoomJoiner,
} from "matrix-protection-suite";

/**
 * Utility to manage which users have access to the application service,
 * meaning whether a user is able to provision a mjolnir or continue to use one.
 * Internally we use a policy list within matrix to determine who has access via the `AccessControlUnit`.
 */
export class AccessControl {
  private constructor(
    private readonly accessControlRevisionIssuer: PolicyListRevisionIssuer,
    private readonly editor: PolicyRoomEditor
  ) {
    // nothing to do.
  }

  /**
   * Construct and initialize access control for the `MjolnirAppService`.
   * @param accessControlListId The room id of a policy list used to manage access to the appservice (who can provision & use mjolniren)
   * @param bridge The matrix-appservice-bridge, used to get the appservice bot.
   * @returns A new instance of `AccessControl` to be used by `MjolnirAppService`.
   */
  public static async setupAccessControlForRoom(
    /** The room id for the access control list. */
    accessControlRoom: MatrixRoomID,
    policyRoomManager: PolicyRoomManager,
    bridgeBotJoiner: RoomJoiner
  ): Promise<ActionResult<AccessControl>> {
    const joinResult = await bridgeBotJoiner.joinRoom(
      accessControlRoom.toRoomIDOrAlias()
    );
    if (isError(joinResult)) {
      return joinResult;
    }
    const revisionIssuer =
      await policyRoomManager.getPolicyRoomRevisionIssuer(accessControlRoom);
    if (isError(revisionIssuer)) {
      return revisionIssuer;
    }
    const editor =
      await policyRoomManager.getPolicyRoomEditor(accessControlRoom);
    if (isError(editor)) {
      return editor;
    }
    return Ok(new AccessControl(revisionIssuer.ok, editor.ok));
  }

  public getUserAccess(mxid: StringUserID): EntityAccess {
    return MPSAccess.getAccessForUser(
      this.accessControlRevisionIssuer.currentRevision,
      mxid,
      "CHECK_SERVER"
    );
  }

  public async allow(
    mxid: StringUserID,
    reason = "<no reason supplied>"
  ): Promise<ActionResult<void>> {
    const result = await this.editor.createPolicy(
      PolicyRuleType.User,
      Recommendation.Allow,
      mxid,
      reason,
      {}
    );
    if (isError(result)) {
      return result;
    } else {
      return Ok(undefined);
    }
  }

  public async remove(mxid: StringUserID): Promise<ActionResult<void>> {
    const result = await this.editor.unbanEntity(PolicyRuleType.User, mxid);
    if (isError(result)) {
      return result;
    } else {
      return Ok(undefined);
    }
  }
}

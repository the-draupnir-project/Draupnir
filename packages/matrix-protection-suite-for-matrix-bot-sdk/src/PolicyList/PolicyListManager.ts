// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionError,
  ActionResult,
  POLICY_ROOM_TYPE,
  MJOLNIR_SHORTCODE_EVENT_TYPE,
  PolicyRoomManager,
  RoomCreateOptions,
  POLICY_ROOM_TYPE_VARIANTS,
  ActionException,
  ActionExceptionKind,
  Ok,
  isError,
  PolicyRuleEvent,
  isPolicyRuleEvent,
  PolicyRoomEditor,
  InternedInstanceFactory,
  PolicyRoomRevisionIssuer,
  PolicyRuleType,
  ClientsInRoomMap,
  StandardPolicyRoomEditor,
  ClientPlatform,
  RoomVersionMirror,
  RoomEvent,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import { RoomStateManagerFactory } from "../ClientManagement/RoomStateManagerFactory";
import {
  StringRoomID,
  MatrixRoomID,
  StringUserID,
  MatrixRoomReference,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";

export class BotSDKPolicyRoomManager implements PolicyRoomManager {
  private readonly issuedEditors = new InternedInstanceFactory<
    StringRoomID,
    PolicyRoomEditor,
    [MatrixRoomID]
  >(async (_roomID, room) => {
    const policyRoomRevisionIssuer =
      await this.factory.getPolicyRoomRevisionIssuer(room, this.clientUserID);
    if (isError(policyRoomRevisionIssuer)) {
      return policyRoomRevisionIssuer;
    }
    const roomStateRevisionIssuer =
      await this.factory.getRoomStateRevisionIssuer(room, this.clientUserID);
    if (isError(roomStateRevisionIssuer)) {
      return roomStateRevisionIssuer;
    }
    const editor = new StandardPolicyRoomEditor(
      room,
      policyRoomRevisionIssuer.ok,
      roomStateRevisionIssuer.ok,
      this.clientPlatform.toRoomStateEventSender()
    );
    return Ok(editor);
  });

  public constructor(
    public readonly clientUserID: StringUserID,
    private readonly client: MatrixSendClient,
    private readonly clientPlatform: ClientPlatform,
    private readonly factory: RoomStateManagerFactory,
    private readonly joinPreempter: Pick<
      ClientsInRoomMap,
      "preemptTimelineJoin"
    >
  ) {
    // nothing to do.
  }

  public async getPolicyRoomEditor(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomEditor>> {
    return await this.issuedEditors.getInstance(room.toRoomIDOrAlias(), room);
  }

  public async createPolicyRoom(
    shortcode: string,
    invite: string[],
    createRoomOptions: RoomCreateOptions
  ): Promise<ActionResult<MatrixRoomID>> {
    const creator = await this.client.getUserId().then(
      (user) => Ok(StringUserID(user)),
      (exception: unknown) =>
        ActionException.Result(
          "Could not create a list because we could not find the mxid of the list creator.",
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
    if (isError(creator)) {
      return creator;
    }
    const clientCapabilities = await this.clientPlatform
      .toClientCapabilitiesNegotiation()
      .getClientCapabilities();
    if (isError(clientCapabilities)) {
      return clientCapabilities.elaborate(
        "Unable to get client capabilities for the policy room creator."
      );
    }
    const isRoomVersionWithPrivilidgedCreators =
      RoomVersionMirror.isVersionWithPrivilegedCreators(
        clientCapabilities.ok.capabilities["m.room_versions"].default
      );
    const powerLevels: RoomCreateOptions["power_level_content_override"] = {
      ban: 50,
      events: {
        "m.room.name": 100,
        "m.room.power_levels": 100,
      },
      events_default: 50, // non-default
      invite: 0,
      kick: 50,
      notifications: {
        room: 20,
      },
      redact: 50,
      state_default: 50,
      users: {
        ...(isRoomVersionWithPrivilidgedCreators ? {} : { [creator.ok]: 100 }),
        ...invite.reduce((users, mxid) => ({ ...users, [mxid]: 50 }), {}),
      },
      users_default: 0,
    };
    const finalRoomCreateOptions: RoomCreateOptions = {
      // Support for MSC3784.
      creation_content: {
        type: POLICY_ROOM_TYPE,
      },
      preset: "public_chat",
      invite,
      initial_state: [
        {
          type: MJOLNIR_SHORTCODE_EVENT_TYPE,
          state_key: "",
          content: { shortcode: shortcode },
        },
      ],
      power_level_content_override: powerLevels,
      ...createRoomOptions,
    };
    // Guard room type in case someone overwrites it when declaring custom creation_content in future code.
    const roomType = finalRoomCreateOptions.creation_content?.type;
    if (
      typeof roomType !== "string" ||
      !POLICY_ROOM_TYPE_VARIANTS.includes(roomType)
    ) {
      throw new TypeError(
        `Creating a policy room with a type other than the policy room type is not supported, you probably don't want to do this.`
      );
    }
    return await this.client.createRoom(finalRoomCreateOptions).then(
      (roomId) => {
        const room = new MatrixRoomID(roomId, [userServerName(creator.ok)]);
        this.joinPreempter.preemptTimelineJoin(
          this.clientUserID,
          room.toRoomIDOrAlias()
        );
        return Ok(room);
      },
      (exception: unknown) =>
        ActionException.Result(
          "Could not create a matrix room to serve as the new policy list.",
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  }

  getPolicyRuleEvents(
    room: MatrixRoomReference
  ): Promise<ActionResult<PolicyRuleEvent[]>> {
    return (
      this.client.getRoomState(room.toRoomIDOrAlias()) as unknown as Promise<
        RoomEvent[]
      >
    ).then(
      // FIXME: I'm pretty sure this filter isn't doing anything, and also
      // it's really bad that we're not using the event coder on the ingress here.
      // And that this API exists at all in abscence of the rooms state manager.
      (events) => Ok(events.filter(isPolicyRuleEvent)),
      (exception: unknown) =>
        ActionError.Result(
          `Could not fetch the room state for the policy list ${room.toPermalink()} and so we are unable to fetch any policy rules.`,
          { exception, exceptionKind: ActionExceptionKind.Unknown }
        )
    );
  }

  public async getPolicyRoomRevisionIssuer(
    room: MatrixRoomID
  ): Promise<ActionResult<PolicyRoomRevisionIssuer>> {
    return await this.factory.getPolicyRoomRevisionIssuer(
      room,
      this.clientUserID
    );
  }

  public getEditablePolicyRoomIDs(
    editor: StringUserID,
    ruleType: PolicyRuleType
  ): MatrixRoomID[] {
    return this.factory.getEditablePolicyRoomIDs(editor, ruleType);
  }
}

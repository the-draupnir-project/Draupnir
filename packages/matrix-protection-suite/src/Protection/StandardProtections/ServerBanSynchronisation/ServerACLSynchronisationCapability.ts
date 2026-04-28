// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  StringRoomID,
  StringServerName,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { RoomStateEventSender } from "../../../Client/RoomStateEventSender";
import { ProtectedRoomsSet } from "../../ProtectedRoomsSet";
import "./ServerBanSynchronisationCapability"; // we need this so the interface is loaded AND yes we are going to move to description objects instead at some point FML.
import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  ActionException,
  ActionExceptionKind,
} from "../../../Interface/ActionException";
import { ServerBanSynchronisationCapability } from "./ServerBanSynchronisationCapability";
import {
  Capability,
  describeCapabilityProvider,
} from "../../Capability/CapabilityProvider";
import {
  RoomSetResult,
  RoomSetResultBuilder,
} from "../../Capability/StandardCapability/RoomSetResult";
import { ServerBanIntentProjection } from "./ServerBanIntentProjection";
import { ServerBanIntentProjectionNode } from "./ServerBanIntentProjectionNode";
import { ServerACLBuilder } from "../../../MatrixTypes/ServerACLBuilder";

class ServerACLQueue {
  private readonly pendingRoomChecks = new Map<
    StringRoomID,
    Promise<Result<boolean>>
  >();

  private readonly activeRoomChecks = new Map<
    StringRoomID,
    Promise<Result<boolean>>
  >();

  public constructor(
    private readonly stateEventSender: RoomStateEventSender,
    private readonly serverName: StringServerName,
    private readonly protectedRoomsSet: ProtectedRoomsSet
  ) {
    // nothing to do.
  }

  private async applyPolicyRevisionToRoom(
    roomID: StringRoomID,
    projection: ServerBanIntentProjection
  ): Promise<Result<boolean>> {
    const ACL = compileServerACL(this.serverName, projection.currentNode);
    const stateRevision =
      this.protectedRoomsSet.setRoomState.getRevision(roomID);
    if (stateRevision === undefined) {
      throw new TypeError(
        `Somehowe we can't get the state for this room ${roomID}`
      );
    }
    const existingStateEvent = stateRevision.getStateEvent(
      "m.room.server_acl",
      ""
    );
    if (
      existingStateEvent !== undefined &&
      ACL.matches(existingStateEvent.content)
    ) {
      return Ok(false);
    }
    const result = await this.stateEventSender.sendStateEvent(
      roomID,
      "m.room.server_acl",
      "",
      ACL.safeAclContent()
    );
    // Give some time between ACL updates to not spam rooms.
    await new Promise((resolve) => setTimeout(resolve, 15_000));
    if (isError(result)) {
      return result;
    } else {
      return Ok(true);
    }
  }

  private async doActiveCheck(
    roomID: StringRoomID,
    projection: ServerBanIntentProjection
  ): Promise<Result<boolean>> {
    try {
      const activeCheck = this.applyPolicyRevisionToRoom(roomID, projection);
      this.activeRoomChecks.set(roomID, activeCheck);
      return await activeCheck;
    } finally {
      this.activeRoomChecks.delete(roomID);
    }
  }

  private async enqueueCheck(
    roomID: StringRoomID,
    projection: ServerBanIntentProjection,
    activeCheck: Promise<Result<boolean>>
  ): Promise<Result<boolean>> {
    try {
      await activeCheck;
    } finally {
      this.pendingRoomChecks.delete(roomID);
    }
    return await this.doActiveCheck(roomID, projection);
  }

  public async enqueueRoomCheck(
    roomID: StringRoomID,
    projection: ServerBanIntentProjection
  ): Promise<Result<boolean>> {
    const pendingCheck = this.pendingRoomChecks.get(roomID);
    if (pendingCheck) {
      return pendingCheck;
    }
    const activeCheck = this.activeRoomChecks.get(roomID);
    if (activeCheck) {
      const pendingCheck = this.enqueueCheck(roomID, projection, activeCheck);
      this.pendingRoomChecks.set(roomID, pendingCheck);
      return await pendingCheck;
    } else {
      return await this.doActiveCheck(roomID, projection);
    }
  }
}

export function compileServerACL(
  ourServerName: StringServerName,
  projectionNode: ServerBanIntentProjectionNode
): ServerACLBuilder {
  const builder = new ServerACLBuilder(ourServerName).denyIpAddresses();
  builder.allowServer("*");
  for (const serverName of projectionNode.deny) {
    builder.denyServer(serverName);
  }
  return builder;
}

export class ServerACLSynchronisationCapability
  implements ServerBanSynchronisationCapability, Capability
{
  public readonly requiredPermissions = [];
  public readonly requiredEventPermissions = [];
  public readonly requiredStatePermissions = ["m.room.server_acl"];
  private readonly queue: ServerACLQueue;

  public constructor(
    stateEventSender: RoomStateEventSender,
    private readonly protectedRoomsSet: ProtectedRoomsSet
  ) {
    this.queue = new ServerACLQueue(
      stateEventSender,
      userServerName(this.protectedRoomsSet.userID),
      protectedRoomsSet
    );
  }

  private async applyIntentToSet(
    intentProjection: ServerBanIntentProjection
  ): Promise<Result<RoomSetResult>> {
    const resultBuilder = new RoomSetResultBuilder();
    try {
      await Promise.all(
        this.protectedRoomsSet.allProtectedRooms.map((room) =>
          this.queue
            .enqueueRoomCheck(room.toRoomIDOrAlias(), intentProjection)
            .then((result) => {
              resultBuilder.addResult(
                room.toRoomIDOrAlias(),
                result as Result<void>
              );
            })
        )
      );
    } catch (e) {
      if (e instanceof Error) {
        return ActionException.Result(
          `Uncaught error while applying server ACLS`,
          {
            exception: e,
            exceptionKind: ActionExceptionKind.Unknown,
          }
        );
      }
    }

    return Ok(resultBuilder.getResult());
  }
  public async outcomeFromIntentInRoom(
    roomID: StringRoomID,
    projection: ServerBanIntentProjection
  ): Promise<Result<boolean>> {
    return await this.queue.enqueueRoomCheck(roomID, projection);
  }
  public async outcomeFromIntentInRoomSet(
    projection: ServerBanIntentProjection
  ): Promise<Result<RoomSetResult>> {
    return await this.applyIntentToSet(projection);
  }
}

export type ServerACLSynchronisationCapabilityContext = {
  stateEventSender: RoomStateEventSender;
  protectedRoomsSet: ProtectedRoomsSet;
};

describeCapabilityProvider({
  name: "ServerACLSynchronisationCapability",
  description:
    "An implementation of ServerConsequences that uses m.room.server_acl to change access to rooms for servers.",
  interface: "ServerBanSynchronisationCapability",
  factory(
    _protectionDescription,
    context: ServerACLSynchronisationCapabilityContext
  ) {
    return new ServerACLSynchronisationCapability(
      context.stateEventSender,
      context.protectedRoomsSet
    );
  },
});

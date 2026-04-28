// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  MatrixRoomID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { PolicyListRevision } from "../../PolicyList/PolicyListRevision";
import { WatchedPolicyRoom, WatchedPolicyRooms } from "./WatchedPolicyRooms";
import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import {
  PolicyListConfig,
  PropagationType,
} from "../PolicyListConfig/PolicyListConfig";
import {
  DirectPropagationPolicyListRevisionIssuer,
  StandardDirectPropagationPolicyListRevisionIssuer,
} from "../DirectPropagationPolicyListRevisionIssuer";
import { PolicyRoomManager } from "../../PolicyList/PolicyRoomManger";
import { PolicyRoomRevisionIssuer } from "../../PolicyList/PolicyListRevisionIssuer";
import { RoomJoiner } from "../../Client/RoomJoiner";

export class StandardWatchedPolicyRooms implements WatchedPolicyRooms {
  private constructor(
    private readonly policyListConfig: PolicyListConfig,
    private readonly policyRoomRevisionIssuers: Map<
      StringRoomID,
      PolicyRoomRevisionIssuer
    >,
    public readonly revisionIssuer: DirectPropagationPolicyListRevisionIssuer,
    private readonly policyRoomManager: PolicyRoomManager,
    private readonly roomJoiner: RoomJoiner
  ) {
    // nothing to do.
  }

  public static async create(
    policyListConfig: PolicyListConfig,
    policyRoomManager: PolicyRoomManager,
    roomJoiner: RoomJoiner
  ): Promise<Result<StandardWatchedPolicyRooms>> {
    const issuers = new Map<StringRoomID, PolicyRoomRevisionIssuer>();
    for (const profile of policyListConfig.allWatchedLists) {
      const revisionIssuer = (
        await policyRoomManager.getPolicyRoomRevisionIssuer(profile.room)
      ).expect(
        "Something is badly wrong if we can't get a policy room revision issuer at this point"
      );
      issuers.set(profile.room.toRoomIDOrAlias(), revisionIssuer);
    }
    const revisionIssuer =
      new StandardDirectPropagationPolicyListRevisionIssuer([
        ...issuers.values(),
      ]);
    return Ok(
      new StandardWatchedPolicyRooms(
        policyListConfig,
        issuers,
        revisionIssuer,
        policyRoomManager,
        roomJoiner
      )
    );
  }

  public async watchPolicyRoomDirectly(
    room: MatrixRoomID
  ): Promise<Result<void>> {
    const joinResult = await this.roomJoiner.joinRoom(room);
    if (isError(joinResult)) {
      return joinResult.elaborate(
        "Unable to join a policy room to be able to watch it"
      );
    }
    const issuerResult =
      await this.policyRoomManager.getPolicyRoomRevisionIssuer(room);
    if (isError(issuerResult)) {
      return issuerResult.elaborate(
        "Unable to get the policy room revision issuer to watch the policy room"
      );
    }
    const storeResult = await this.policyListConfig.watchList(
      PropagationType.Direct,
      room,
      {}
    );
    if (isError(storeResult)) {
      return storeResult.elaborate(
        "Unable to persist the new list subscription"
      );
    }
    this.revisionIssuer.addIssuer(issuerResult.ok);
    this.policyRoomRevisionIssuers.set(room.toRoomIDOrAlias(), issuerResult.ok);
    return Ok(undefined);
  }

  public async unwatchPolicyRoom(room: MatrixRoomID): Promise<Result<void>> {
    const issuer = this.policyRoomRevisionIssuers.get(room.toRoomIDOrAlias());
    if (issuer === undefined) {
      return ResultError.Result(
        "Unable to unwatch the list because it is not currently being watched"
      );
    }
    const storeResult = await this.policyListConfig.unwatchList(
      PropagationType.Direct,
      room
    );
    if (isError(storeResult)) {
      return storeResult.elaborate(
        "Unable to persist removing the list subscription"
      );
    }
    this.policyRoomRevisionIssuers.delete(room.toRoomIDOrAlias());
    this.revisionIssuer.removeIssuer(issuer);
    return Ok(undefined);
  }

  public get allRooms(): WatchedPolicyRoom[] {
    return [...this.policyRoomRevisionIssuers.values()].map((issuer) => ({
      revision: issuer.currentRevision,
      room: issuer.room,
      propagation: PropagationType.Direct,
    }));
  }

  public get currentRevision(): PolicyListRevision {
    return this.revisionIssuer.currentRevision;
  }

  public unregisterListeners(): void {
    this.revisionIssuer.unregisterListeners();
  }

  public findPolicyRoomFromShortcode(
    shortcode: string
  ): WatchedPolicyRoom | undefined {
    for (const { currentRevision } of this.policyRoomRevisionIssuers.values()) {
      if (currentRevision.shortcode === shortcode) {
        return {
          revision: currentRevision,
          room: currentRevision.room,
          propagation: PropagationType.Direct,
        };
      }
    }
    return undefined;
  }
}

// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionResult,
  Capability,
  DescriptionMeta,
  Ok,
  ResultForUsersInRoom,
  ResultForUsersInSet,
  RoomSetResult,
  StandardUserConsequencesContext,
  TargetMember,
  UserConsequences,
  describeCapabilityContextGlue,
  describeCapabilityRenderer,
  isError,
} from "matrix-protection-suite";
import { RendererMessageCollector } from "./RendererMessageCollector";
import {
  renderFailedSingularConsequence,
  renderOutcome,
  renderResultForUsersInRoom,
  renderRoomSetResult,
} from "./CommonRenderers";
import { Draupnir } from "../Draupnir";
import { renderRoomPill } from "../commands/interface-manager/MatrixHelpRenderer";
import {
  StringUserID,
  StringRoomID,
  Permalinks,
  MatrixRoomReference,
} from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";

// yeah i know this is a bit insane but whatever, it can be our secret.
function renderResultForUserInSetMap(
  usersInSetMap: ResultForUsersInSet,
  {
    ingword,
    nnedword,
    description,
  }: {
    ingword: string;
    nnedword: string;
    description: DescriptionMeta;
  }
): DocumentNode {
  return (
    <details>
      <summary>
        <code>{description.name}</code>: {ingword} {usersInSetMap.map.size}{" "}
        &#32;
        {usersInSetMap.map.size === 1 ? "user" : "users"} from protected rooms -
        &#32;
        {renderOutcome(usersInSetMap.isEveryResultOk)}.
      </summary>
      {[...usersInSetMap.map.entries()].map(([userID, roomResults]) =>
        renderRoomSetResultForUser(roomResults, userID, nnedword, {})
      )}
    </details>
  );
}

function renderRoomSetResultForUser(
  roomResults: RoomSetResult,
  userID: StringUserID,
  nnedword: string,
  { description }: { description?: DescriptionMeta }
): DocumentNode {
  return renderRoomSetResult(roomResults, {
    summary: (
      <fragment>
        {description === undefined ? (
          ""
        ) : (
          <fragment>
            <code>{description.name}</code>:
          </fragment>
        )}
        {userID} will be {nnedword} from {roomResults.map.size} rooms - &#32;
        {renderOutcome(roomResults.isEveryResultOk)}.
      </fragment>
    ),
  });
}

class StandardUserConsequencesRenderer implements UserConsequences {
  constructor(
    private readonly description: DescriptionMeta,
    private readonly messageCollector: RendererMessageCollector,
    private readonly capability: UserConsequences
  ) {
    // nothing to do.
  }
  public readonly requiredEventPermissions =
    this.capability.requiredEventPermissions;
  public readonly requiredPermissions = this.capability.requiredPermissions;
  public readonly requiredStatePermissions =
    this.capability.requiredStatePermissions;

  public async consequenceForUserInRoom(
    roomID: StringRoomID,
    userID: StringUserID,
    reason: string
  ): Promise<ActionResult<void>> {
    const capabilityResult = await this.capability.consequenceForUserInRoom(
      roomID,
      userID,
      reason
    );
    const title = (
      <fragment>
        Banning user {userID} in {Permalinks.forRoom(roomID)} for {reason}.
      </fragment>
    );
    if (isError(capabilityResult)) {
      this.messageCollector.addMessage(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          title,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    this.messageCollector.addOneliner(this.description, this.capability, title);
    return Ok(undefined);
  }
  public async consequenceForUsersInRoomSet(
    targets: TargetMember[]
  ): Promise<ActionResult<ResultForUsersInSet>> {
    const capabilityResult =
      await this.capability.consequenceForUsersInRoomSet(targets);
    if (isError(capabilityResult)) {
      const title = (
        <fragment>Applying policy revision to protected rooms</fragment>
      );
      this.messageCollector.addMessage(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          title,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    const usersInSetMap = capabilityResult.ok;
    if (usersInSetMap.map.size === 0) {
      return capabilityResult;
    }
    this.messageCollector.addMessage(
      this.description,
      this.capability,
      renderResultForUserInSetMap(usersInSetMap, {
        ingword: "Banning",
        nnedword: "banned",
        description: this.description,
      })
    );
    return capabilityResult;
  }
  public async consequenceForUsersInRoom(
    roomID: StringRoomID,
    targets: TargetMember[]
  ): Promise<ActionResult<ResultForUsersInRoom>> {
    const capabilityResult = await this.capability.consequenceForUsersInRoom(
      roomID,
      targets
    );
    if (isError(capabilityResult)) {
      const title = (
        <fragment>
          Applying policy revision to{" "}
          {renderRoomPill(MatrixRoomReference.fromRoomID(roomID, []))}
        </fragment>
      );
      this.messageCollector.addMessage(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          title,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    const resultMap = capabilityResult.ok;
    if (resultMap.map.size === 0) {
      return capabilityResult;
    }
    this.messageCollector.addMessage(
      this.description,
      this.capability,
      renderResultForUsersInRoom(resultMap, {
        summary: (
          <fragment>
            {
              <fragment>
                <code>{this.description.name}</code>:
              </fragment>
            }
            {resultMap.map.size} will be banned from{" "}
            {renderRoomPill(MatrixRoomReference.fromRoomID(roomID))} - &#32;
            {renderOutcome(resultMap.isEveryResultOk)}.
          </fragment>
        ),
      })
    );
    return capabilityResult;
  }
  public async unbanUserFromRoomSet(
    userID: StringUserID,
    reason: string
  ): Promise<ActionResult<RoomSetResult>> {
    const capabilityResult = await this.capability.unbanUserFromRoomSet(
      userID,
      reason
    );
    if (isError(capabilityResult)) {
      const title = (
        <fragment>Unbanning {userID} from protected rooms</fragment>
      );
      this.messageCollector.addMessage(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          title,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    const usersInSetMap = capabilityResult.ok;
    if (usersInSetMap.map.size === 0) {
      return capabilityResult;
    }
    this.messageCollector.addMessage(
      this.description,
      this.capability,
      renderRoomSetResultForUser(usersInSetMap, userID, "unbanned", {
        description: this.description,
      })
    );
    return capabilityResult;
  }
}

describeCapabilityRenderer<UserConsequences, Draupnir>({
  name: "StandardUserConsequences",
  description: "Renders your mum useless",
  interface: "UserConsequences",
  factory(description, draupnir, capability) {
    return new StandardUserConsequencesRenderer(
      description,
      draupnir.capabilityMessageRenderer,
      capability
    );
  },
  isDefaultForInterface: true,
});

describeCapabilityContextGlue<Draupnir, StandardUserConsequencesContext>({
  name: "StandardUserConsequences",
  glueMethod: function (
    protectionDescription,
    draupnir,
    capabilityProvider
  ): Capability {
    return capabilityProvider.factory(protectionDescription, {
      roomBanner: draupnir.clientPlatform.toRoomBanner(),
      roomUnbanner: draupnir.clientPlatform.toRoomUnbanner(),
      setMembership: draupnir.protectedRoomsSet.setRoomMembership,
    });
  },
});

describeCapabilityContextGlue<Draupnir, StandardUserConsequencesContext>({
  name: "SimulatedUserConsequences",
  glueMethod: function (
    protectionDescription,
    draupnir,
    capabilityProvider
  ): Capability {
    return capabilityProvider.factory(protectionDescription, {
      setMembership: draupnir.protectedRoomsSet.setRoomMembership,
    } as StandardUserConsequencesContext);
  },
});

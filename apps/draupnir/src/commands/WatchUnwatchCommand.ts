// Copyright 2022, 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  PolicyRoomManager,
  ProtectedRoomsSet,
  RoomJoiner,
  WatchedPolicyRooms,
  isError,
} from "matrix-protection-suite";
import {
  MatrixRoomReferencePresentationSchema,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { Draupnir } from "../Draupnir";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";
import {
  generateWatchPreview,
  renderWatchCommandPreview,
  WatchPolicyRoomPreview,
} from "./WatchPreview";

export type DraupnirWatchUnwatchCommandContext = {
  watchedPolicyRooms: WatchedPolicyRooms;
  roomJoiner: RoomJoiner;
  policyRoomManager: PolicyRoomManager;
  protectedRoomsSet: ProtectedRoomsSet;
};

export const DraupnirWatchPolicyRoomCommand = describeCommand({
  summary:
    "Watches a list and applies the list's assocated policies to draupnir's protected rooms.",
  parameters: tuple({
    name: "policy room",
    acceptor: MatrixRoomReferencePresentationSchema,
  }),
  keywords: {
    keywordDescriptions: {
      "no-confirm": {
        isFlag: true,
        description: "Runs the command without the preview.",
      },
    },
  },
  async executor(
    {
      watchedPolicyRooms,
      roomJoiner,
      policyRoomManager,
      protectedRoomsSet,
    }: DraupnirWatchUnwatchCommandContext,
    _info,
    keywords,
    _rest,
    policyRoomReference
  ): Promise<Result<undefined | WatchPolicyRoomPreview>> {
    const policyRoom = await roomJoiner.joinRoom(policyRoomReference);
    if (isError(policyRoom)) {
      return policyRoom.elaborate("Failed to resolve or join the room");
    }
    if (
      watchedPolicyRooms.allRooms.some(
        (profile) =>
          profile.room.toRoomIDOrAlias() === policyRoom.ok.toRoomIDOrAlias()
      )
    ) {
      return ResultError.Result("We are already watching this list.");
    }
    if (keywords.getKeywordValue<boolean>("no-confirm", false)) {
      const watchResult = await watchedPolicyRooms.watchPolicyRoomDirectly(
        policyRoom.ok
      );
      if (isError(watchResult)) {
        return watchResult;
      }
      return Ok(undefined);
    }
    const revisionIssuer = await policyRoomManager.getPolicyRoomRevisionIssuer(
      policyRoom.ok
    );
    if (isError(revisionIssuer)) {
      return revisionIssuer.elaborate(
        "Failed to fetch policy room revision issuer"
      );
    }
    return Ok(
      generateWatchPreview(protectedRoomsSet, revisionIssuer.ok.currentRevision)
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirWatchPolicyRoomCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
  confirmationPromptJSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    } else if (commandResult.ok === undefined) {
      return Ok(undefined);
    } else {
      return Ok(renderWatchCommandPreview(commandResult.ok));
    }
  },
});
DraupnirContextToCommandContextTranslator.registerTranslation(
  DraupnirWatchPolicyRoomCommand,
  buildWatchContext
);

export const DraupnirUnwatchPolicyRoomCommand = describeCommand({
  summary:
    "Unwatches a list and stops applying the list's assocated policies to draupnir's protected rooms.",
  parameters: tuple({
    name: "policy room",
    acceptor: MatrixRoomReferencePresentationSchema,
  }),
  async executor(
    { watchedPolicyRooms, roomJoiner }: DraupnirWatchUnwatchCommandContext,
    _info,
    _keywords,
    _rest,
    policyRoomReference
  ): Promise<Result<void>> {
    const policyRoom = await roomJoiner.resolveRoom(policyRoomReference);
    if (isError(policyRoom)) {
      return policyRoom;
    }
    return await watchedPolicyRooms.unwatchPolicyRoom(policyRoom.ok);
  },
});

function buildWatchContext(
  draupnir: Draupnir
): DraupnirWatchUnwatchCommandContext {
  return {
    watchedPolicyRooms: draupnir.protectedRoomsSet.watchedPolicyRooms,
    roomJoiner: draupnir.clientPlatform.toRoomJoiner(),
    policyRoomManager: draupnir.policyRoomManager,
    protectedRoomsSet: draupnir.protectedRoomsSet,
  };
}

DraupnirInterfaceAdaptor.describeRenderer(DraupnirUnwatchPolicyRoomCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});
DraupnirContextToCommandContextTranslator.registerTranslation(
  DraupnirUnwatchPolicyRoomCommand,
  buildWatchContext
);

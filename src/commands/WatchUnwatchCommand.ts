// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  RoomResolver,
  WatchedPolicyRooms,
  isError,
} from "matrix-protection-suite";
import {
  MatrixRoomReferencePresentationSchema,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Result, ResultError } from "@gnuxie/typescript-result";
import { Draupnir } from "../Draupnir";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";

export type DraupnirWatchUnwatchCommandContext = {
  watchedPolicyRooms: WatchedPolicyRooms;
  roomResolver: RoomResolver;
};

export const DraupnirWatchPolicyRoomCommand = describeCommand({
  summary:
    "Watches a list and applies the list's associated policies to draupnir's protected rooms.",
  parameters: tuple({
    name: "policy room",
    acceptor: MatrixRoomReferencePresentationSchema,
  }),
  async executor(
    { watchedPolicyRooms, roomResolver }: DraupnirWatchUnwatchCommandContext,
    _info,
    _keywords,
    _rest,
    policyRoomReference
  ): Promise<Result<void>> {
    const policyRoom = await roomResolver.resolveRoom(policyRoomReference);
    if (isError(policyRoom)) {
      return policyRoom;
    }
    if (
      watchedPolicyRooms.allRooms.some(
        (profile) =>
          profile.room.toRoomIDOrAlias() === policyRoom.ok.toRoomIDOrAlias()
      )
    ) {
      return ResultError.Result("We are already watching this list.");
    }
    return await watchedPolicyRooms.watchPolicyRoomDirectly(policyRoom.ok);
  },
});

export const DraupnirUnwatchPolicyRoomCommand = describeCommand({
  summary:
    "Unwatches a list and stops applying the list's associated policies to draupnir's protected rooms.",
  parameters: tuple({
    name: "policy room",
    acceptor: MatrixRoomReferencePresentationSchema,
  }),
  async executor(
    { watchedPolicyRooms, roomResolver }: DraupnirWatchUnwatchCommandContext,
    _info,
    _keywords,
    _rest,
    policyRoomReference
  ): Promise<Result<void>> {
    const policyRoom = await roomResolver.resolveRoom(policyRoomReference);
    if (isError(policyRoom)) {
      return policyRoom;
    }
    return await watchedPolicyRooms.unwatchPolicyRoom(policyRoom.ok);
  },
});

for (const command of [
  DraupnirWatchPolicyRoomCommand,
  DraupnirUnwatchPolicyRoomCommand,
]) {
  DraupnirInterfaceAdaptor.describeRenderer(command, {
    isAlwaysSupposedToUseDefaultRenderer: true,
  });
  DraupnirContextToCommandContextTranslator.registerTranslation(
    command,
    (draupnir: Draupnir) => ({
      watchedPolicyRooms: draupnir.protectedRoomsSet.watchedPolicyRooms,
      roomResolver: draupnir.clientPlatform.toRoomResolver(),
    })
  );
}

// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { PropagationType, isError } from "matrix-protection-suite";
import {
  MatrixRoomReferencePresentationSchema,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";
import { Draupnir } from "../Draupnir";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirWatchPolicyRoomCommand = describeCommand({
  summary:
    "Watches a list and applies the list's assocated policies to draupnir's protected rooms.",
  parameters: tuple({
    name: "policy room",
    acceptor: MatrixRoomReferencePresentationSchema,
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    policyRoomReference
  ): Promise<Result<void>> {
    const policyRoom = await draupnir.clientPlatform
      .toRoomResolver()
      .resolveRoom(policyRoomReference);
    if (isError(policyRoom)) {
      return policyRoom;
    }
    return await draupnir.protectedRoomsSet.issuerManager.watchList(
      PropagationType.Direct,
      policyRoom.ok,
      {}
    );
  },
});

export const DraupnirUnwatchPolicyRoomCommand = describeCommand({
  summary:
    "Unwatches a list and stops applying the list's assocated policies to draupnir's protected rooms.",
  parameters: tuple({
    name: "policy room",
    acceptor: MatrixRoomReferencePresentationSchema,
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    policyRoomReference
  ): Promise<Result<void>> {
    const policyRoom = await draupnir.clientPlatform
      .toRoomResolver()
      .resolveRoom(policyRoomReference);
    if (isError(policyRoom)) {
      return policyRoom;
    }
    return await draupnir.protectedRoomsSet.issuerManager.unwatchList(
      PropagationType.Direct,
      policyRoom.ok
    );
  },
});

for (const command of [
  DraupnirWatchPolicyRoomCommand,
  DraupnirUnwatchPolicyRoomCommand,
]) {
  DraupnirInterfaceAdaptor.describeRenderer(command, {
    isAlwaysSupposedToUseDefaultRenderer: true,
  });
}

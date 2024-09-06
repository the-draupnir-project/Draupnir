// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Ok, Result, isError } from "@gnuxie/typescript-result";
import { Draupnir } from "../Draupnir";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirSetPowerLevelCommand = describeCommand({
  summary:
    "Set the power level of a user across the protected rooms set, or within the provided rooms",
  parameters: tuple(
    {
      name: "user",
      acceptor: MatrixUserIDPresentationType,
    },
    {
      name: "power level",
      acceptor: StringPresentationType,
    }
  ),
  rest: {
    name: "rooms",
    acceptor: MatrixRoomReferencePresentationSchema,
  },
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    roomRefs,
    user,
    rawPowerLevel
  ): Promise<Result<void>> {
    const powerLevel = Number.parseInt(rawPowerLevel, 10);
    const resolvedGivenRooms: MatrixRoomID[] = [];
    for (const room of roomRefs) {
      const resolvedResult = await draupnir.clientPlatform
        .toRoomResolver()
        .resolveRoom(room);
      if (isError(resolvedResult)) {
        return resolvedResult;
      } else {
        resolvedGivenRooms.push(resolvedResult.ok);
      }
    }
    const rooms =
      roomRefs.length === 0
        ? draupnir.protectedRoomsSet.allProtectedRooms
        : resolvedGivenRooms;
    for (const room of rooms) {
      await draupnir.client.setUserPowerLevel(
        user.toString(),
        room.toRoomIDOrAlias(),
        powerLevel
      );
    }
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirSetPowerLevelCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

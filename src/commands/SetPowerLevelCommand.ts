// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionResult, Ok, isError } from "matrix-protection-suite";
import { DraupnirContext } from "./CommandHandler";
import {
  ParsedKeywords,
  RestDescription,
  findPresentationType,
  parameters,
} from "./interface-manager/ParameterParsing";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { defineInterfaceCommand } from "./interface-manager/InterfaceCommand";
import {
  MatrixRoomID,
  MatrixRoomReference,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";

async function setPowerLevelCommand(
  this: DraupnirContext,
  _keywords: ParsedKeywords,
  user: MatrixUserID,
  powerLevel: string,
  ...givenRooms: MatrixRoomReference[]
): Promise<ActionResult<void>> {
  const parsedLevel = Number.parseInt(powerLevel, 10);
  const resolvedGivenRooms: MatrixRoomID[] = [];
  for (const room of givenRooms) {
    const resolvedResult = await resolveRoomReferenceSafe(this.client, room);
    if (isError(resolvedResult)) {
      return resolvedResult;
    } else {
      resolvedGivenRooms.push(resolvedResult.ok);
    }
  }
  const rooms =
    givenRooms.length === 0
      ? this.draupnir.protectedRoomsSet.allProtectedRooms
      : resolvedGivenRooms;
  for (const room of rooms) {
    await this.draupnir.client.setUserPowerLevel(
      user.toString(),
      room.toRoomIDOrAlias(),
      parsedLevel
    );
  }
  return Ok(undefined);
}

defineInterfaceCommand({
  table: "draupnir",
  designator: ["powerlevel"],
  parameters: parameters(
    [
      {
        name: "user",
        acceptor: findPresentationType("MatrixUserID"),
      },
      {
        name: "power level",
        acceptor: findPresentationType("string"),
      },
    ],
    new RestDescription("rooms", findPresentationType("MatrixRoomReference"))
  ),
  command: setPowerLevelCommand,
  summary:
    "Set the power level of a user across the protected rooms set, or within the provided rooms",
});

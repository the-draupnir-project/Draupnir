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
  ActionResult,
  MatrixEventReference,
  MatrixEventViaAlias,
  MatrixEventViaRoomID,
  MatrixRoomReference,
  Ok,
  UserID,
  isError,
} from "matrix-protection-suite";
import { redactUserMessagesIn } from "../utils";
import {
  KeywordsDescription,
  ParsedKeywords,
  RestDescription,
  findPresentationType,
  parameters,
  union,
} from "./interface-manager/ParameterParsing";
import { DraupnirContext } from "./CommandHandler";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { Draupnir } from "../Draupnir";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";

export async function redactEvent(
  draupnir: Draupnir,
  reference: MatrixEventReference,
  reason: string
): Promise<ActionResult<void>> {
  const resolvedRoom = await resolveRoomReferenceSafe(
    draupnir.client,
    reference.reference
  );
  if (isError(resolvedRoom)) {
    return resolvedRoom;
  }
  await draupnir.client.redactEvent(
    resolvedRoom.ok.toRoomIDOrAlias(),
    reference.eventID,
    reason
  );
  return Ok(undefined);
}

export async function redactCommand(
  this: DraupnirContext,
  keywords: ParsedKeywords,
  reference: UserID | MatrixEventReference,
  ...reasonParts: string[]
): Promise<ActionResult<void>> {
  const reason = reasonParts.join(" ");
  if (
    reference instanceof MatrixEventViaAlias ||
    reference instanceof MatrixEventViaRoomID
  ) {
    return await redactEvent(this.draupnir, reference, reason);
  }
  const rawLimit = keywords.getKeyword<string>("limit", undefined);
  const limit =
    rawLimit === undefined ? undefined : Number.parseInt(rawLimit, 10);
  const restrictToRoomReference = keywords.getKeyword<MatrixRoomReference>(
    "room",
    undefined
  );
  const restrictToRoom = restrictToRoomReference
    ? await resolveRoomReferenceSafe(this.client, restrictToRoomReference)
    : undefined;
  if (restrictToRoom !== undefined && isError(restrictToRoom)) {
    return restrictToRoom;
  }
  const roomsToRedactWithin =
    restrictToRoom === undefined
      ? this.draupnir.protectedRoomsSet.allProtectedRooms
      : [restrictToRoom.ok];
  await redactUserMessagesIn(
    this.client,
    this.draupnir.managementRoomOutput,
    reference.toString(),
    roomsToRedactWithin.map((room) => room.toRoomIDOrAlias()),
    limit,
    this.draupnir.config.noop
  );
  return Ok(undefined);
}

defineInterfaceCommand({
  designator: ["redact"],
  table: "draupnir",
  parameters: parameters(
    [
      {
        name: "entity",
        acceptor: union(
          findPresentationType("UserID"),
          findPresentationType("MatrixEventReference")
        ),
      },
    ],
    new RestDescription<DraupnirContext>(
      "reason",
      findPresentationType("string"),
      async function (_parameter) {
        return {
          suggestions: this.draupnir.config.commands.ban.defaultReasons,
        };
      }
    ),
    new KeywordsDescription({
      limit: {
        name: "limit",
        isFlag: false,
        acceptor: findPresentationType("string"),
        description: "Limit the number of messages to be redacted per room.",
      },
      room: {
        name: "room",
        isFlag: false,
        acceptor: findPresentationType("MatrixRoomReference"),
        description:
          "Allows the command to be scoped to just one protected room.",
      },
    })
  ),
  command: redactCommand,
  summary:
    "Redacts either a users's recent messagaes within protected rooms or a specific message shared with the bot.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "redact"),
  renderer: tickCrossRenderer,
});

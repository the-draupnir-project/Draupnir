// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { ActionResult, Ok, isError } from "matrix-protection-suite";
import { redactUserMessagesIn } from "../utils";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { Draupnir } from "../Draupnir";
import {
  MatrixEventReference,
  MatrixEventViaAlias,
  MatrixEventViaRoomID,
  MatrixRoomReference,
} from "@the-draupnir-project/matrix-basic-types";
import {
  MatrixEventReferencePresentationType,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  PresentationSchemaType,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

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

export const DraupnirRedactCommand = describeCommand({
  summary:
    "Redacts either a users's recent messages within protected rooms or a specific message shared with the bot.",
  parameters: tuple({
    name: "entity",
    acceptor: {
      schemaType: PresentationSchemaType.Union,
      variants: [
        MatrixUserIDPresentationType,
        MatrixEventReferencePresentationType,
      ],
    },
  }),
  keywords: {
    keywordDescriptions: {
      limit: {
        acceptor: StringPresentationType,
        description: "Limit the number of messages to be redacted per room.",
      },
      room: {
        acceptor: MatrixRoomReferencePresentationSchema,
        description:
          "Allows the command to be scoped to just one protected room.",
      },
    },
  },
  rest: {
    name: "reason",
    acceptor: StringPresentationType,
  },
  async executor(
    draupnir: Draupnir,
    _info,
    keywords,
    reasonParts,
    entity
  ): Promise<ActionResult<void>> {
    const reason = reasonParts.join(" ");
    if (
      entity instanceof MatrixEventViaAlias ||
      entity instanceof MatrixEventViaRoomID
    ) {
      return await redactEvent(draupnir, entity, reason);
    }
    const rawLimit = keywords.getKeywordValue<string>("limit", undefined);
    const limit =
      rawLimit === undefined ? undefined : Number.parseInt(rawLimit, 10);
    const restrictToRoomReference =
      keywords.getKeywordValue<MatrixRoomReference>("room", undefined);
    const restrictToRoom = restrictToRoomReference
      ? await resolveRoomReferenceSafe(draupnir.client, restrictToRoomReference)
      : undefined;
    if (restrictToRoom !== undefined && isError(restrictToRoom)) {
      return restrictToRoom;
    }
    const roomsToRedactWithin =
      restrictToRoom === undefined
        ? draupnir.protectedRoomsSet.allProtectedRooms
        : [restrictToRoom.ok];
    await redactUserMessagesIn(
      draupnir.client,
      draupnir.managementRoomOutput,
      entity.toString(),
      roomsToRedactWithin.map((room) => room.toRoomIDOrAlias()),
      limit,
      draupnir.config.noop
    );
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirRedactCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

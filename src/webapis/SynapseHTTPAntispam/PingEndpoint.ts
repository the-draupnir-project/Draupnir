// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from Draupnir
// https://github.com/the-draupnir-project/Draupnir
// </text>

import { Type } from "@sinclair/typebox";
import { Request, Response } from "express";
import { isError, Logger, Value } from "matrix-protection-suite";

const log = new Logger("PingEndpoint");

const PingBody = Type.Object({
  id: Type.Unknown(),
});

export function handleHttpAntispamPing(
  request: Request,
  response: Response
): void {
  const decodedBody = Value.Decode(PingBody, request.body);
  if (isError(decodedBody)) {
    log.error("Error decoding request body:", decodedBody.error);
    response.status(400).send({
      errcode: "M_INVALID_PARAM",
      error: "Error decoding request body",
    });
    return;
  }
  response.status(200).send({
    id: decodedBody.ok.id,
    status: "ok",
  });
}

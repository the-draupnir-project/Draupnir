// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Type } from "@sinclair/typebox";
import { MatrixError } from "@vector-im/matrix-bot-sdk";
import { Value, assertThrowableIsError } from "matrix-protection-suite";

const MatrixErrorBody = Type.Object({
  errcode: Type.String(),
  error: Type.String(),
  retry_after_ms: Type.Optional(Type.Number()),
});

// The matrix-bot-sdk appservice code sometimes throws junk like `{ body: result }`
// for example in`Intent.ensureRegistered()`.
const MatrixErrorContainer = Type.Object({
  body: MatrixErrorBody,
  statusCode: Type.Optional(Type.Number()),
  headers: Type.Optional(Type.Record(Type.String(), Type.String())),
});

/**
 * This exists because the matrix-bot-sdk and matrix-appservice-bridge have
 * various inconsistent ways of throwing errors. And Draupnir's own code
 * probably makes matters worse in utils.ts. So this is a wrapper for all of
 * the undesirable junk that gets thrown. Eventually we want to replace as
 * many bot-sdk apis as possible with the matrix-protection-suite ClientPlatform
 * an also then implement those apis using fetch.
 */
export class BotSDKJunkError extends Error {
  public constructor(
    public readonly raw: unknown,
    public readonly matrixErrorCode: string,
    public readonly matrixErrorMessage: string
  ) {
    super(
      `matrix-bot-sdk threw a non-Error matrix payload: ${matrixErrorCode}: ${matrixErrorMessage}`
    );
  }
}

export function toMatrixJunkError(error: unknown): BotSDKJunkError | Error {
  if (error instanceof MatrixError) {
    return error;
  }
  if (Value.Check(MatrixErrorContainer, error)) {
    return new BotSDKJunkError(error, error.body.errcode, error.body.error);
  }
  if (Value.Check(MatrixErrorBody, error)) {
    return new BotSDKJunkError(error, error.errcode, error.error);
  }
  return assertThrowableIsError(error);
}

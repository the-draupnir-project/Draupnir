// Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { ActionError, ActionResult, ResultError } from "./Action";
import { ActionException, ActionExceptionKind } from "./ActionException";

// might be best also to have a version of result with a room id that
// explains what we were trying to do ? not sure.
export interface RoomUpdateError extends ActionError {
  readonly room: MatrixRoomID;
}

export class RoomActionError extends ActionError implements RoomUpdateError {
  constructor(
    public readonly room: MatrixRoomID,
    message: string,
    elaborations: string[] = []
  ) {
    super(message, elaborations);
  }

  public static Result(
    message: string,
    { room }: { room: MatrixRoomID }
  ): ActionResult<never, PermissionError> {
    return ResultError(new PermissionError(room, message));
  }

  public static fromActionError(
    room: MatrixRoomID,
    error: ActionError
  ): RoomUpdateError {
    if (error instanceof ActionException) {
      return RoomUpdateException.fromActionException(room, error);
    } else if (error instanceof RoomActionError) {
      return error;
    } else {
      return new RoomActionError(room, error.message, error.getElaborations());
    }
  }
}

export class PermissionError extends RoomActionError {}

export class RoomUpdateException
  extends ActionException
  implements RoomUpdateError
{
  constructor(
    public readonly room: MatrixRoomID,
    ...args: ConstructorParameters<typeof ActionException>
  ) {
    super(...args);
  }

  public static Result<Ok>(
    message: string,
    options: {
      exception: Error;
      exceptionKind: ActionExceptionKind;
      room: MatrixRoomID;
    }
  ): ActionResult<Ok, RoomUpdateException> {
    return ResultError(
      new RoomUpdateException(
        options.room,
        options.exceptionKind,
        options.exception,
        message
      )
    );
  }

  public static fromActionException(
    room: MatrixRoomID,
    error: ActionException
  ): RoomUpdateException {
    return new RoomUpdateException(
      room,
      error.exceptionKind,
      error.exception,
      error.message,
      {
        uuid: error.uuid,
        suppressLog: true,
        elaborations: error.getElaborations(),
      }
    );
  }
}

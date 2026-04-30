// SPDX-FileCopyrightText: 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ActionException,
  ActionExceptionKind,
  ActionResult,
  MatrixAccountData,
  MatrixStateData,
  Ok,
  PersistentConfigBackend,
  RoomStateRevisionIssuer,
  Value,
  assertThrowableIsError,
  isError,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import {
  is404,
  resultifyBotSDKRequestError,
  resultifyBotSDKRequestErrorWith404AsUndefined,
} from "../Client/BotSDKBaseClient";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";

export class BotSDKAccountDataConfigBackend<
  TEncodedShape extends Record<string, unknown> = Record<string, unknown>,
> implements PersistentConfigBackend<TEncodedShape> {
  constructor(
    private readonly client: MatrixSendClient,
    private readonly eventType: string
  ) {
    // nothing to do.
  }

  public async requestUnparsedConfig(): Promise<
    ActionResult<Record<string, unknown> | undefined>
  > {
    return await this.client
      .getAccountData(this.eventType)
      .then(
        (data) => Ok(data as Record<string, undefined>),
        resultifyBotSDKRequestErrorWith404AsUndefined
      );
  }
  public async saveEncodedConfig(
    data: TEncodedShape
  ): Promise<ActionResult<void>> {
    return await this.client
      .setAccountData(this.eventType, data)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
  public async saveUnparsedConfig(
    data: Record<string, unknown>
  ): Promise<ActionResult<void>> {
    return await this.client
      .setAccountData(this.eventType, data)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
}

export class BotSDKMatrixAccountData<T> implements MatrixAccountData<T> {
  constructor(
    private readonly eventType: string,
    private readonly eventSchema: Parameters<(typeof Value)["Decode"]>[0],
    private readonly client: MatrixSendClient
  ) {
    // nothing to do.
  }
  public async requestAccountData(): Promise<ActionResult<T | undefined>> {
    return await this.client.getAccountData(this.eventType).then(
      (data) => Value.Decode(this.eventSchema, data),
      (error: unknown) =>
        is404(error)
          ? Ok(undefined)
          : ActionException.Result(
              `Encountered an error when requesting matrix account data ${this.eventType}`,
              {
                exception: assertThrowableIsError(error),
                exceptionKind: ActionExceptionKind.Unknown,
              }
            )
    );
  }
  public async storeAccountData(data: T): Promise<ActionResult<void>> {
    const encodeResult = Value.Encode(this.eventSchema, data);
    if (isError(encodeResult)) {
      return encodeResult;
    }
    return await this.client
      .setAccountData(this.eventType, encodeResult.ok)
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to store matrix account data ${this.eventType}`,
            {
              exception: assertThrowableIsError(exception),
              exceptionKind: ActionExceptionKind.Unknown,
            }
          )
      );
  }
}

// FIXME: This is incorrect, it's supposed to wrap the standard thingy.
export class BotSDKRoomStateConfigBackend<
  TEncodedShape extends Record<string, unknown> = Record<string, unknown>,
> implements PersistentConfigBackend<TEncodedShape> {
  constructor(
    private readonly client: MatrixSendClient,
    private readonly roomID: StringRoomID,
    private readonly eventType: string,
    private readonly stateKey: string
  ) {
    // nothing to do.
  }
  public async requestUnparsedConfig(): Promise<
    ActionResult<Record<string, unknown> | undefined>
  > {
    return await this.client
      .getRoomStateEvent(this.roomID, this.eventType, this.stateKey)
      .then(
        (data) => Ok(data as Record<string, undefined>),
        resultifyBotSDKRequestErrorWith404AsUndefined
      );
  }
  public async saveEncodedConfig(
    data: TEncodedShape
  ): Promise<ActionResult<void>> {
    return await this.client
      .sendStateEvent(this.roomID, this.eventType, this.stateKey, data)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
  }
}

export class BotSDKMatrixStateData<T> implements MatrixStateData<T> {
  constructor(
    private readonly eventType: string,
    private readonly roomStateRevisionIssuer: RoomStateRevisionIssuer,
    private readonly client: MatrixSendClient
  ) {
    // nothing to do.
  }
  public requestStateContent(state_key: string): T | undefined {
    const event = this.roomStateRevisionIssuer.currentRevision.getStateEvent(
      this.eventType,
      state_key
    );
    return event?.content as T | undefined;
  }
  public async storeStateContent(
    state_key: string,
    content: T
  ): Promise<ActionResult<void>> {
    return await this.client
      .sendStateEvent(
        this.roomStateRevisionIssuer.room.toRoomIDOrAlias(),
        this.eventType,
        state_key,
        content
      )
      .then(
        (_) => Ok(undefined),
        (exception: unknown) =>
          ActionException.Result(
            `Unable to store the matrix state data ${this.eventType}`,
            {
              exception: assertThrowableIsError(exception),
              exceptionKind: ActionExceptionKind.Known,
            }
          )
      );
  }
}

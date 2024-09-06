// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { WeakEvent } from "matrix-appservice-bridge";
import { MjolnirAppService } from "../AppService";
import {
  ActionResult,
  ClientPlatform,
  RoomMessage,
  Value,
  isError,
} from "matrix-protection-suite";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import {
  StringUserID,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import {
  makeAppserviceBotCommandDispatcher,
  makeAppserviceJSCommandDispatcher,
} from "./AppserviceBotCommandDispatcher";
import {
  MatrixInterfaceCommandDispatcher,
  JSInterfaceCommandDispatcher,
  BasicInvocationInformation,
  StandardPresentationArgumentStream,
  Presentation,
} from "@the-draupnir-project/interface-manager";
import { MatrixEventContext } from "../../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { MatrixReactionHandler } from "../../commands/interface-manager/MatrixReactionHandler";
import {
  ARGUMENT_PROMPT_LISTENER,
  DEFAUILT_ARGUMENT_PROMPT_LISTENER,
  makeListenerForArgumentPrompt,
  makeListenerForPromptDefault,
} from "../../commands/interface-manager/MatrixPromptForAccept";
import "./AppserviceBotCommands";

export type AppserviceBaseExecutor = (
  this: AppserviceAdaptorContext,
  ...args: unknown[]
) => Promise<ActionResult<unknown>>;

export class AppserviceCommandHandler {
  private readonly appserviceContext: AppserviceAdaptorContext;
  private readonly commandDispatcher: MatrixInterfaceCommandDispatcher<MatrixEventContext>;
  private readonly reactionHandler: MatrixReactionHandler;
  private readonly JSInterfaceDispatcher: JSInterfaceCommandDispatcher<BasicInvocationInformation>;

  constructor(
    public readonly clientUserID: StringUserID,
    private readonly client: MatrixSendClient,
    private readonly adminRoomID: StringRoomID,
    private readonly clientPlatform: ClientPlatform,
    private readonly appservice: MjolnirAppService
  ) {
    this.reactionHandler = new MatrixReactionHandler(
      this.appservice.accessControlRoomID,
      this.appservice.bridge.getBot().getClient(),
      this.appservice.botUserID,
      clientPlatform
    );
    this.appserviceContext = {
      appservice: this.appservice,
      commandRoomID: this.adminRoomID,
      client: this.client,
      clientPlatform: this.clientPlatform,
      clientUserID: this.clientUserID,
      reactionHandler: this.reactionHandler,
    };
    this.commandDispatcher = makeAppserviceBotCommandDispatcher(
      this.appserviceContext
    );
    this.reactionHandler.on(
      ARGUMENT_PROMPT_LISTENER,
      makeListenerForArgumentPrompt(this.commandDispatcher)
    );
    this.reactionHandler.on(
      DEFAUILT_ARGUMENT_PROMPT_LISTENER,
      makeListenerForPromptDefault(this.commandDispatcher)
    );
    this.JSInterfaceDispatcher = makeAppserviceJSCommandDispatcher(
      this.appserviceContext
    );
  }

  public handleEvent(mxEvent: WeakEvent): void {
    if (mxEvent.room_id !== this.adminRoomID) {
      return;
    }
    const parsedEventResult = Value.Decode(RoomMessage, mxEvent);
    if (isError(parsedEventResult)) {
      return;
    }
    const parsedEvent = parsedEventResult.ok;
    const body =
      typeof mxEvent.content["body"] === "string"
        ? mxEvent.content["body"]
        : "";
    this.commandDispatcher.handleCommandMessageEvent(
      {
        event: parsedEvent,
        roomID: parsedEvent.room_id,
      },
      body
    );
  }

  public async sendTextCommand<CommandReturn>(
    sender: StringUserID,
    command: string
  ): Promise<ActionResult<CommandReturn>> {
    return await this.JSInterfaceDispatcher.invokeCommandFromBody(
      { commandSender: sender },
      command
    );
  }

  public async sendPresentationCommand<CommandReturn>(
    sender: StringUserID,
    ...items: Presentation[]
  ): Promise<ActionResult<CommandReturn>> {
    return await this.JSInterfaceDispatcher.invokeCommandFromPresentationStream(
      { commandSender: sender },
      new StandardPresentationArgumentStream(items)
    );
  }
}

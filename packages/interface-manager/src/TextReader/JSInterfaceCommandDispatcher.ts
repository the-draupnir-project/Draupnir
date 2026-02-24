// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { CommandDescription, CommandTable, PartialCommand } from "../Command";
import { PresentationArgumentStream } from "../Command/PresentationStream";
import { BasicInvocationInformation } from "../MatrixInterfaceAdaptor";
import {
  AdaptorContextToCommandContextTranslator,
  CommandDispatcher,
  CommandDispatcherCallbacks,
  CommandInvoker,
  StandardCommandInvoker,
} from "../Adaptor";
import { Result, isError } from "@gnuxie/typescript-result";
import { StandardCommandDispatcher } from "./StandardCommandDispatcher";

export class StandardJSInterfaceCommandDispatcher<
  AdaptorContext,
> implements JSInterfaceCommandDispatcher<BasicInvocationInformation> {
  private readonly commandInvoker: CommandInvoker<BasicInvocationInformation>;
  private readonly commandDispatcher: CommandDispatcher<BasicInvocationInformation>;
  public constructor(
    private readonly commandTable: CommandTable,
    private readonly helpCommand: CommandDescription,
    private readonly adaptorContext: AdaptorContext,
    private readonly callbacks: CommandDispatcherCallbacks<BasicInvocationInformation>,
    private readonly contextTranslator?: AdaptorContextToCommandContextTranslator<AdaptorContext>
  ) {
    this.commandInvoker =
      new StandardCommandInvoker<BasicInvocationInformation>(this.callbacks);
    this.commandDispatcher =
      new StandardCommandDispatcher<BasicInvocationInformation>(
        this.commandTable,
        this.helpCommand,
        this.callbacks
      );
  }

  private async invokeAndParsePartialCommand<CommandResult>(
    invocationInformation: BasicInvocationInformation,
    partialCommand: PartialCommand
  ): Promise<Result<CommandResult>> {
    const completeCommand = this.commandInvoker.parseCommand(
      invocationInformation,
      partialCommand
    );
    if (isError(completeCommand)) {
      return completeCommand;
    }
    const commandContext =
      this.contextTranslator?.translateContext(
        completeCommand.ok.description,
        this.adaptorContext
      ) ?? this.adaptorContext;
    return (await this.commandInvoker.invoke(
      commandContext,
      invocationInformation,
      completeCommand.ok
    )) as Result<CommandResult>;
  }

  public async invokeCommandFromPresentationStream<CommandResult>(
    invocationInformation: BasicInvocationInformation,
    stream: PresentationArgumentStream
  ): Promise<Result<CommandResult>> {
    const partialCommand = this.commandDispatcher.parsePartialCommandFromStream(
      invocationInformation,
      stream
    );
    if (isError(partialCommand)) {
      return partialCommand;
    }
    return await this.invokeAndParsePartialCommand(
      invocationInformation,
      partialCommand.ok
    );
  }

  public async invokeCommandFromBody<CommandResult>(
    invocationInformation: BasicInvocationInformation,
    body: string
  ): Promise<Result<CommandResult>> {
    const partialCommand = this.commandDispatcher.parsePartialCommandFromBody(
      invocationInformation,
      body
    );
    if (isError(partialCommand)) {
      return partialCommand;
    }
    return await this.invokeAndParsePartialCommand(
      invocationInformation,
      partialCommand.ok
    );
  }
}

export interface JSInterfaceCommandDispatcher<InvocationInformation> {
  invokeCommandFromBody<CommandResult>(
    invocationInformation: InvocationInformation,
    body: string
  ): Promise<Result<CommandResult>>;
  invokeCommandFromPresentationStream<CommandResult>(
    invocationInformation: InvocationInformation,
    stream: PresentationArgumentStream
  ): Promise<Result<CommandResult>>;
}

// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { isError } from "@gnuxie/typescript-result";
import {
  BasicInvocationInformation,
  InvocationInformationFromEventContext,
  MatrixInterfaceAdaptor,
} from "./MatrixInterfaceAdaptor";
import {
  CommandDescription,
  CommandMeta,
  CommandTable,
  PresentationArgumentStream,
} from "../Command";
import { StandardCommandDispatcher } from "../TextReader/StandardCommandDispatcher";
import { CommandDispatcherCallbacks } from "../Adaptor";

export interface MatrixInterfaceCommandDispatcher<MatrixEventContext> {
  handleCommandMessageEvent(
    eventContext: MatrixEventContext,
    body: string
  ): void;
  handleCommandFromPresentationStream(
    eventContext: MatrixEventContext,
    stream: PresentationArgumentStream
  ): void;
}

export class StandardMatrixInterfaceCommandDispatcher<
  AdaptorContext,
  MatrixEventContext,
  THelpCommandMeta extends CommandMeta,
> implements MatrixInterfaceCommandDispatcher<MatrixEventContext> {
  private readonly baseDispatcher: StandardCommandDispatcher<BasicInvocationInformation>;
  public constructor(
    private readonly interfaceAdaptor: MatrixInterfaceAdaptor<
      AdaptorContext,
      MatrixEventContext
    >,
    private readonly adaptorContext: AdaptorContext,
    private readonly commandTable: CommandTable,
    private readonly helpCommand: CommandDescription<THelpCommandMeta>,
    private readonly invocationInformationFromEventContext: InvocationInformationFromEventContext<MatrixEventContext>,
    callbacks: CommandDispatcherCallbacks<BasicInvocationInformation>,
    /**
     * Sometimes it is useful to check whether all commands in a table have a renderer, and all renderers have a command in the table.
     * Becuase people can forget to import them properly. This can be disabled if table imports are dynamic.
     */
    verifyOptions?: { verifyRenderers?: boolean; verifyTable?: boolean }
  ) {
    this.baseDispatcher =
      new StandardCommandDispatcher<BasicInvocationInformation>(
        this.commandTable,
        this.helpCommand,
        callbacks
      );
    if (verifyOptions?.verifyRenderers ?? true) {
      this.verifyAdaptorRenderingAllCommands();
    }
    if (verifyOptions?.verifyTable ?? true) {
      this.verifyTableImportingAllRenderedCommands();
    }
  }

  handleCommandFromPresentationStream(
    eventContext: MatrixEventContext,
    stream: PresentationArgumentStream
  ): void {
    const partialCommand = this.baseDispatcher.parsePartialCommandFromStream(
      this.invocationInformationFromEventContext(eventContext),
      stream
    );
    if (isError(partialCommand)) {
      return; // callbacks should be handled by the baseDispatcher already.
    }
    void this.interfaceAdaptor.parseAndInvoke(
      partialCommand.ok,
      this.adaptorContext,
      eventContext
    );
  }

  handleCommandMessageEvent(
    eventContext: MatrixEventContext,
    body: string
  ): void {
    const partialCommand = this.baseDispatcher.parsePartialCommandFromBody(
      this.invocationInformationFromEventContext(eventContext),
      body
    );
    if (isError(partialCommand)) {
      return; // callbacks should be handled by the baseDispatcher already.
    }
    void this.interfaceAdaptor.parseAndInvoke(
      partialCommand.ok,
      this.adaptorContext,
      eventContext
    );
  }

  private verifyAdaptorRenderingAllCommands(): void {
    for (const command of this.commandTable.getAllCommands()) {
      if (
        !this.interfaceAdaptor.isDescribingRendererForCommand(
          command.currentCommand
        )
      ) {
        throw new TypeError(
          `Adaptor does not render command ${command.designator.toString()}`
        );
      }
    }
  }

  private verifyTableImportingAllRenderedCommands(): void {
    for (const command of this.interfaceAdaptor.renderedCommands()) {
      if (!this.commandTable.isContainingCommand(command)) {
        throw new TypeError(
          `Command table does not contain a command that is specified in the interface adaptor ${command.summary}\n${command.description}`
        );
      }
    }
  }
}

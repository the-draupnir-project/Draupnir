// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  Command,
  CommandDescription,
  CompleteCommand,
  ExtractCommandMeta,
  ParameterDescription,
  PartialCommand,
  Presentation,
  PromptRequiredError,
} from "../Command";
import { MatrixRendererDescription } from "./MatrixRendererDescription";
import { DocumentNode } from "../DeadDocument";
import { AdaptorContextToCommandContextTranslator } from "../Adaptor/AdaptorContextToCommandContextTranslator";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";
import { CommandMeta } from "../Command/CommandMeta";
import {
  CommandInvoker,
  CommandInvokerCallbacks,
  StandardCommandInvoker,
} from "../Adaptor";
import { renderConfirmationPrompt } from "./DefaultRenderers";

export type BasicInvocationInformation = {
  readonly commandSender: StringUserID;
};

export type InvocationInformationFromEventContext<
  MatrixEventContext,
  InvocationInformation extends BasicInvocationInformation =
    BasicInvocationInformation,
> = (eventContext: MatrixEventContext) => InvocationInformation;

export interface MatrixInterfaceAdaptor<AdaptorContext, MatrixEventContext> {
  /**
   * Invoke the command object, running the command executor and then calling
   * each of the configured renderers for the interface adaptor.
   */
  invoke(
    command: CompleteCommand,
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext
  ): Promise<Result<void>>;
  /**
   * Parse the arguments to the command description and then call `invoke`.
   * The commandDesignator is required so that we can produce a `Command` object.
   */
  parseAndInvoke(
    partialCommand: PartialCommand,
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext
  ): Promise<Result<void>>;
  registerRendererDescription<TCommandDescription extends CommandDescription>(
    commandDescription: TCommandDescription,
    rendererDescription: MatrixRendererDescription
  ): MatrixInterfaceAdaptor<AdaptorContext, MatrixEventContext>;
  describeRenderer<TCommandMeta extends CommandMeta>(
    commandDescription: CommandDescription<TCommandMeta>,
    rendererDescription: DescribeMatrixRenderer<
      AdaptorContext,
      MatrixEventContext,
      TCommandMeta["CommandResult"]
    >
  ): MatrixInterfaceAdaptor<AdaptorContext, MatrixEventContext>;
  isDescribingRendererForCommand<
    TCommandDescription extends CommandDescription,
  >(
    commandDescription: TCommandDescription
  ): boolean;
  renderedCommands(): CommandDescription[];
}

export type MatrixInterfaceDefaultRenderer<
  AdaptorContext,
  MatrixEventContext,
  CommandResult = unknown,
> = (
  adaptorCotnext: AdaptorContext,
  matrixEventContext: MatrixEventContext,
  command: Command,
  commandResult: Result<CommandResult>
) => Promise<Result<void>>;

export type MatrixInterfaceEventsFromDeadDocument<
  AdaptorContext,
  MatrixEventContext,
> = (
  adaptorContext: AdaptorContext,
  eventContext: MatrixEventContext,
  document: DocumentNode
) => Promise<Result<void>>;

export type MatrixInterfaceRendererFailedCB<
  AdaptorContext,
  MatrixEventContext,
> = (
  adaptorContext: AdaptorContext,
  matrixEventContext: MatrixEventContext,
  command: Command,
  error: ResultError
) => void;

export type MatrixInterfaceAdaptorCallbacks<
  AdaptorContext,
  MatrixEventContext,
> = {
  readonly promptDefault: <ObjectType = unknown>(
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext,
    parameter: ParameterDescription<ObjectType>,
    command: PartialCommand,
    defaultPrompt: Presentation<ObjectType>,
    existingArguments: Presentation[]
  ) => Promise<Result<void>>;
  readonly promptSuggestions: <ObjectType>(
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext,
    parameter: ParameterDescription<ObjectType>,
    command: PartialCommand,
    suggestions: Presentation<ObjectType>[],
    existingArguments: Presentation[]
  ) => Promise<Result<void>>;
  /** Render the result and return an error if there was a problem while rendering. */
  readonly defaultRenderer: MatrixInterfaceDefaultRenderer<
    AdaptorContext,
    MatrixEventContext
  >;
  readonly matrixEventsFromDeadDocument: MatrixInterfaceEventsFromDeadDocument<
    AdaptorContext,
    MatrixEventContext
  >;
  readonly rendererFailedCB: MatrixInterfaceRendererFailedCB<
    AdaptorContext,
    MatrixEventContext
  >;
  /**
   * Render a confirmation prompt to matrix.
   */
  readonly matrixEventsFromConfirmationPrompt: (
    adaptor: AdaptorContext,
    event: MatrixEventContext,
    command: CompleteCommand,
    document: DocumentNode
  ) => Promise<Result<void>>;
};

export class StandardMatrixInterfaceAdaptor<
  AdaptorContext,
  MatrixEventContext,
> implements MatrixInterfaceAdaptor<AdaptorContext, MatrixEventContext> {
  private readonly commandInvoker: CommandInvoker<BasicInvocationInformation>;
  private readonly renderers = new Map<
    CommandDescription,
    MatrixRendererDescription
  >();
  private readonly callbacks: MatrixInterfaceAdaptorCallbacks<
    AdaptorContext,
    MatrixEventContext
  >;
  public constructor(
    private readonly adaptorToCommandContextTranslator: AdaptorContextToCommandContextTranslator<AdaptorContext>,
    private readonly invocationInformationFromEventContext: InvocationInformationFromEventContext<MatrixEventContext>,
    interfaceAdaptorCallbacks: MatrixInterfaceAdaptorCallbacks<
      AdaptorContext,
      MatrixEventContext
    >,
    commandInvokerCallbacks: CommandInvokerCallbacks<BasicInvocationInformation>
  ) {
    this.commandInvoker = new StandardCommandInvoker(commandInvokerCallbacks);
    this.callbacks = interfaceAdaptorCallbacks;
  }
  public async invoke<CommandResult>(
    command: CompleteCommand,
    adaptorContext: AdaptorContext,
    matrixEventContext: MatrixEventContext
  ): Promise<Result<CommandResult>> {
    const renderer = this.findRendererForCommandDescription(
      command.description
    );
    const commandContext =
      this.adaptorToCommandContextTranslator.translateContext(
        command.description,
        adaptorContext
      );
    const commandResult = await this.commandInvoker.invoke(
      commandContext,
      this.invocationInformationFromEventContext(matrixEventContext),
      command
    );
    return (await this.runRenderersOnCommandResult(
      command,
      commandResult,
      renderer,
      adaptorContext,
      matrixEventContext
    )) as Result<CommandResult>;
  }

  private findRendererForCommandDescription(
    commandDescription: CommandDescription
  ): MatrixRendererDescription {
    const renderer = this.renderers.get(commandDescription);
    if (renderer === undefined) {
      throw new TypeError(
        `There is no renderer defined for the command ${commandDescription.summary}`
      );
    }
    return renderer;
  }

  private async runRenderersOnCommandResult(
    command: Command,
    commandResult: Result<unknown>,
    renderer: MatrixRendererDescription,
    adaptorContext: AdaptorContext,
    matrixEventContext: MatrixEventContext
  ): Promise<Result<unknown>> {
    const renderResults = await Promise.all([
      this.maybeRunDefaultRenderer(
        renderer,
        adaptorContext,
        matrixEventContext,
        command,
        commandResult
      ),
      this.maybeRunJSXRenderer(
        renderer,
        adaptorContext,
        matrixEventContext,
        command,
        commandResult
      ),
      this.maybeRunArbritraryRenderer(
        renderer,
        adaptorContext,
        matrixEventContext,
        commandResult
      ),
    ]);
    for (const result of renderResults) {
      if (isError(result)) {
        this.callbacks.rendererFailedCB(
          adaptorContext,
          matrixEventContext,
          command,
          result.error
        );
      }
    }
    return commandResult;
  }

  private async maybeRunDefaultRenderer(
    renderer: MatrixRendererDescription,
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext,
    command: Command,
    commandResult: Result<unknown>
  ): Promise<Result<void>> {
    if (!renderer.isAlwaysSupposedToUseDefaultRenderer) {
      return Ok(undefined);
    }
    return await this.callbacks.defaultRenderer(
      adaptorContext,
      eventContext,
      command,
      commandResult
    );
  }

  private async maybeRunJSXRenderer(
    renderer: MatrixRendererDescription,
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext,
    command: Command,
    commandResult: Result<unknown>
  ): Promise<Result<void>> {
    if (
      command.description.parametersDescription.keywords.keywordDescriptions[
        "no-confirm"
      ] !== undefined &&
      !command.isPartial &&
      !command.keywords.getKeywordValue<boolean>("no-confirm", false)
    ) {
      const finalDocument = renderer.confirmationPromptJSXRenderer
        ? renderer.confirmationPromptJSXRenderer(commandResult)
        : renderConfirmationPrompt(commandResult);
      if (isError(finalDocument)) {
        return finalDocument;
      }
      if (finalDocument.ok === undefined) {
        return Ok(undefined); // Renderer is telling us it doesn't want to render anything.
      }
      return await this.callbacks.matrixEventsFromConfirmationPrompt(
        adaptorContext,
        eventContext,
        command,
        finalDocument.ok
      );
    }
    if (!renderer.JSXRenderer) {
      return Ok(undefined);
    }
    const document = renderer.JSXRenderer(commandResult);
    if (isError(document)) {
      return document;
    }
    if (document.ok === undefined) {
      return Ok(undefined); // Renderer is telling us it doesn't want to render anything.
    }
    return await this.callbacks.matrixEventsFromDeadDocument(
      adaptorContext,
      eventContext,
      document.ok
    );
  }

  private async maybeRunArbritraryRenderer(
    renderer: MatrixRendererDescription,
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext,
    commandResult: Result<unknown>
  ): Promise<Result<void>> {
    if (renderer.arbritraryRenderer) {
      return await renderer.arbritraryRenderer(
        adaptorContext,
        eventContext,
        commandResult
      );
    } else {
      return Ok(undefined);
    }
  }
  public registerRendererDescription(
    commandDescription: CommandDescription,
    rendererDescription: MatrixRendererDescription
  ): this {
    this.renderers.set(commandDescription, rendererDescription);
    return this;
  }
  public describeRenderer<TCommandDescription extends CommandDescription>(
    commandDescription: TCommandDescription,
    rendererDescription: DescribeMatrixRenderer<
      AdaptorContext,
      MatrixEventContext,
      ExtractCommandMeta<TCommandDescription>["CommandResult"]
    >
  ): MatrixInterfaceAdaptor<AdaptorContext, MatrixEventContext> {
    return this.registerRendererDescription(commandDescription, {
      ...rendererDescription,
      isAlwaysSupposedToUseDefaultRenderer:
        rendererDescription.isAlwaysSupposedToUseDefaultRenderer ?? true,
    });
  }

  public async parseAndInvoke(
    partialCommand: PartialCommand,
    adaptorContext: AdaptorContext,
    eventContext: MatrixEventContext
  ): Promise<Result<void>> {
    const renderer = this.findRendererForCommandDescription(
      partialCommand.description
    );
    const commandArguments = partialCommand.stream.rest();
    const parseResult = this.commandInvoker.parseCommand(
      this.invocationInformationFromEventContext(eventContext),
      partialCommand
    );
    if (isError(parseResult)) {
      if (parseResult.error instanceof PromptRequiredError) {
        const parameter = parseResult.error.parameterRequiringPrompt;
        if (parameter.prompt === undefined) {
          throw new TypeError(
            `A PromptRequiredError was given for a parameter which doesn't support prompts, this shouldn't happen`
          );
        }
        const commandContext =
          this.adaptorToCommandContextTranslator.translateContext(
            partialCommand.description,
            adaptorContext
          );
        const promptOptionsResult = await parameter.prompt(
          commandContext as never // weh, we know we have the right adaptorContext, it's just being annoying while we avoid controvariance.
        );
        if (isError(promptOptionsResult)) {
          return promptOptionsResult.elaborate(
            `Failed to get prompt options for ${parameter.name} while parsing the command "${partialCommand.designator.join(" ")}".`
          );
        }
        const promptOptions = promptOptionsResult.ok;
        const promptResult =
          promptOptions.default === undefined
            ? await this.callbacks.promptSuggestions(
                adaptorContext,
                eventContext,
                parameter,
                partialCommand,
                promptOptions.suggestions,
                commandArguments
              )
            : await this.callbacks.promptDefault(
                adaptorContext,
                eventContext,
                parameter,
                partialCommand,
                promptOptions.default,
                commandArguments
              );
        if (isError(promptResult)) {
          return promptResult.elaborate(
            `Failed to prompt the user for ${parameter.name} while parsing the command "${partialCommand.designator.join(" ")}".`
          );
        } else {
          return Ok(undefined);
        }
      } else {
        return (await this.runRenderersOnCommandResult(
          partialCommand,
          parseResult,
          renderer,
          adaptorContext,
          eventContext
        )) as Result<void>;
      }
    }
    return await this.invoke(parseResult.ok, adaptorContext, eventContext);
  }

  public isDescribingRendererForCommand<
    TCommandDescription extends CommandDescription,
  >(commandDescription: TCommandDescription): boolean {
    return this.renderers.has(commandDescription);
  }

  public renderedCommands(): CommandDescription[] {
    return [...this.renderers.keys()];
  }
}

export type DescribeMatrixRenderer<
  AdaptorContext = unknown,
  MatrixEventContext = unknown,
  CommandResult = unknown,
  AdaptorArguments extends unknown[] = unknown[],
> = Omit<
  MatrixRendererDescription<
    AdaptorContext,
    MatrixEventContext,
    CommandResult,
    AdaptorArguments
  >,
  "isAlwaysSupposedToUseDefaultRenderer"
> & {
  isAlwaysSupposedToUseDefaultRenderer?: boolean;
};

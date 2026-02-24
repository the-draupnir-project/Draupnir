// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Result } from "@gnuxie/typescript-result";
import { DocumentNode } from "../DeadDocument";

export interface MatrixRendererDescription<
  AdaptorContext = unknown,
  MatrixEventContext = unknown,
  CommandResult = unknown,
  AdaptorArguments extends unknown[] = unknown[],
> {
  /**
   * Render the result of a command invocation to DeadDocument.
   * The interface adaptor will then render this back to Matrix using an event.
   * @returns either the rendererd command or `undefined` if the renderer wants to rely on the default or arbritrary renderer.
   */
  JSXRenderer?(
    commandResult: Result<CommandResult>
  ): Result<DocumentNode | undefined>;
  /**
   * Whether to always use the default renderer regardless of supporting renderers.
   * For example, Draupnir uses a renderer that adds tick and cross emoji to
   * commands depending on their result.
   * If true, then the default renderer  will get called after the JSXRenderer, and after the noConfirmJSXRenderer.
   * This is supposed to be true by default.
   */
  isAlwaysSupposedToUseDefaultRenderer: boolean;
  /**
   * If you need to do something completely arbritrary you can do so using this renderer.
   * The interface adaptor will give you everything that it has itself to render
   * `DeadDocument` back to Matrix.
   * @param context
   * @param commandResult
   * @param adaptorArguments
   */
  arbritraryRenderer?(
    context: AdaptorContext,
    eventContext: MatrixEventContext,
    commandResult: Result<CommandResult>,
    ...adaptorArguments: AdaptorArguments
  ): Promise<Result<void>>;

  /**
   * If there is a description for the confirmation keyword `--no-confirm`, then
   * and `--no-confirm` is not present, then this renderer will be called.
   */
  confirmationPromptJSXRenderer?(
    commandResult: Result<CommandResult>
  ): Result<DocumentNode | undefined>;
}

// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { CommandDescription } from "../Command";
import { CommandMeta } from "../Command/CommandMeta";

/**
 * This is used to add glue code to take what is essentially a god context into a more specific
 * attenuated one that can be unit tested easily.
 * So basically, rather than giving a command the entirity of Draupnir, we can
 * give it juts the capability to ban a user. Which simplifies test setup.
 */
export type AdaptorContextToCommandContextTranslationFunction<
  AdaptorContext,
  CommandContext,
> = (adaptorContext: AdaptorContext) => CommandContext;

export interface AdaptorContextToCommandContextTranslator<AdaptorContext> {
  translateContext<TCommandMeta extends CommandMeta>(
    commandDescription: CommandDescription<TCommandMeta>,
    adaptorContext: AdaptorContext
  ): TCommandMeta["Context"];
  registerTranslation<TCommandMeta extends CommandMeta>(
    commandDescription: CommandDescription<TCommandMeta>,
    translationFunction: AdaptorContextToCommandContextTranslationFunction<
      AdaptorContext,
      TCommandMeta["Context"]
    >
  ): AdaptorContextToCommandContextTranslator<AdaptorContext>;
}

export class StandardAdaptorContextToCommandContextTranslator<
  AdaptorContext,
> implements AdaptorContextToCommandContextTranslator<AdaptorContext> {
  private readonly translators = new Map<
    CommandDescription,
    AdaptorContextToCommandContextTranslationFunction<AdaptorContext, unknown>
  >();
  translateContext<TCommandMeta extends CommandMeta>(
    commandDescription: CommandDescription<TCommandMeta>,
    adaptorContext: AdaptorContext
  ): TCommandMeta["Context"] {
    const entry = this.translators.get(
      // i really don't care.
      commandDescription as unknown as CommandDescription
    );
    if (entry === undefined) {
      return adaptorContext as unknown as TCommandMeta["Context"];
    } else {
      return entry(adaptorContext) as TCommandMeta["Context"];
    }
  }
  registerTranslation<TCommandMeta extends CommandMeta>(
    commandDescription: CommandDescription<TCommandMeta>,
    translationFunction: AdaptorContextToCommandContextTranslationFunction<
      AdaptorContext,
      TCommandMeta["Context"]
    >
  ): AdaptorContextToCommandContextTranslator<AdaptorContext> {
    if (
      this.translators.has(commandDescription as unknown as CommandDescription)
    ) {
      throw new TypeError(
        `There is already a translation function registered for the command ${commandDescription.summary}`
      );
    }
    this.translators.set(
      commandDescription as unknown as CommandDescription,
      translationFunction
    );
    return this;
  }
}

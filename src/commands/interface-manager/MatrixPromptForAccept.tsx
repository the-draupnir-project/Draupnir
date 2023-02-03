/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { renderMatrixAndSend } from "./DeadDocumentMatrix";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { JSXFactory } from "./JSXFactory";
import { MatrixContext } from "./MatrixInterfaceAdaptor";
import { PromptResponseListener } from "./MatrixPromptUX";
import { ParamaterDescription } from "./ParamaterParsing";
import { PromptOptions } from "./PromptForAccept";
import { CommandResult } from "./Validation";

// How are prompts going to work?
// We need to temporarily hook onto the event emitter.
async function promptDefault<PresentationType>(this: MatrixContext, paramater: ParamaterDescription, command: InterfaceCommand<BaseFunction>, defaultPrompt: PresentationType) {
    await renderMatrixAndSend(
        <p>
            No argument was provided for the paramater {paramater.name}, would you like to accept the default?<br/>
            {defaultPrompt}
        </p>,
        this.roomId, this.event, this.client
    )
}

// FIXME: <ol> raw tags will not work if the message is sent across events.
//        If there isn't a start attribute for `ol` then we'll need to take this into our own hands.

async function promptSuggestions<PresentationType>(
    this: MatrixContext, paramater: ParamaterDescription, command: InterfaceCommand<BaseFunction>, suggestions: PresentationType[]
): Promise</*event id*/string> {
    return (await renderMatrixAndSend(
        <ol>
            {suggestions.map((suggestion: PresentationType) => {
                return <li>
                    {suggestion}
                </li>
            })}
        </ol>,
        this.roomId, this.event, this.client
    )).at(0) as string;

}

export async function matrixPromptForAccept<PresentationType = any> (
    this: MatrixContext, paramater: ParamaterDescription, command: InterfaceCommand<BaseFunction>, promptOptions: PromptOptions
): Promise<CommandResult<PresentationType>> {
    const promptHelper = new PromptResponseListener(this.emitter);
    if (promptOptions.default) {
        await promptDefault.call(this, paramater, command, promptOptions.default);
        throw new TypeError("default prompts are not implemented yet.");
    }
    return await promptHelper.waitForPresentationList<PresentationType>(
        promptOptions.suggestions,
        promptSuggestions.call(this, paramater, command, promptOptions.suggestions)
    );
}

/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ActionResult, StringUserID } from "matrix-protection-suite";
import { renderMatrixAndSend } from "./DeadDocumentMatrix";
import { BaseFunction, InterfaceCommand } from "./InterfaceCommand";
import { JSXFactory } from "./JSXFactory";
import { MatrixContext } from "./MatrixInterfaceAdaptor";
import { PromptResponseListener } from "./MatrixPromptUX";
import { ParameterDescription } from "./ParameterParsing";
import { PromptOptions } from "./PromptForAccept";

async function promptDefault<PresentationType>(this: MatrixContext, parameter: ParameterDescription, command: InterfaceCommand<BaseFunction>, defaultPrompt: PresentationType) {
    await renderMatrixAndSend(
        <root>
            No argument was provided for the parameter {parameter.name}, would you like to accept the default?<br/>
            {defaultPrompt}
        </root>,
        this.roomID, this.event, this.client
    )
}

// FIXME: <ol> raw tags will not work if the message is sent across events.
//        If there isn't a start attribute for `ol` then we'll need to take this into our own hands.

async function promptSuggestions<PresentationType>(
    this: MatrixContext, parameter: ParameterDescription, command: InterfaceCommand<BaseFunction>, suggestions: PresentationType[]
): Promise</*event id*/string> {
    return (await renderMatrixAndSend(
        <root>Please select one of the following options to provide as an argument for the parameter <code>{parameter.name}</code>:
            <ol>
                {suggestions.map((suggestion: PresentationType) => {
                    return <li>
                        {suggestion}
                    </li>
                })}
            </ol>
        </root>,
        this.roomID, this.event, this.client
    )).at(0) as string;

}

export async function matrixPromptForAccept<PresentationType = any> (
    this: MatrixContext, parameter: ParameterDescription, command: InterfaceCommand<BaseFunction>, promptOptions: PromptOptions
): Promise<ActionResult<PresentationType>> {
    // FIXME: is there a better way to get the clinet ID? why isn't Draupnir in the command context?
    const promptHelper = new PromptResponseListener(this.emitter, await this.client.getUserId() as StringUserID, this.client);
    if (promptOptions.default) {
        await promptDefault.call(this, parameter, command, promptOptions.default);
        throw new TypeError("default prompts are not implemented yet.");
    }
    return await promptHelper.waitForPresentationList<PresentationType>(
        promptOptions.suggestions,
        this.roomID,
        promptSuggestions.call(this, parameter, command, promptOptions.suggestions)
    );
}

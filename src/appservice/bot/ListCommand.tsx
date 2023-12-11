/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { defineMatrixInterfaceAdaptor, MatrixContext, MatrixInterfaceAdaptor } from '../../commands/interface-manager/MatrixInterfaceAdaptor';
import { UnstartedMjolnir } from '../MjolnirManager';
import { BaseFunction, defineInterfaceCommand } from '../../commands/interface-manager/InterfaceCommand';
import { findPresentationType, parameters } from '../../commands/interface-manager/ParameterParsing';
import { AppserviceBaseExecutor } from './AppserviceCommandHandler';
import { UserID } from 'matrix-bot-sdk';
import { tickCrossRenderer } from '../../commands/interface-manager/MatrixHelpRenderer';
import { JSXFactory } from '../../commands/interface-manager/JSXFactory';
import { renderMatrixAndSend } from '../../commands/interface-manager/DeadDocumentMatrix';
import { ActionError, ActionResult, isError, Ok } from 'matrix-protection-suite';
import { MatrixSendClient } from 'matrix-protection-suite-for-matrix-bot-sdk';

/**
 * There is ovbiously something we're doing very wrong here,
 * all just to satisfy type contstraints.
 * Really there should only be `defineApplicationCommand`
 * and `defineMatrixInterfaceCommand` but we have to do this
 * long winded dance just to make type contstraints work.
 * There might be a better way, but at what cost.
 */

const listUnstarted = defineInterfaceCommand<AppserviceBaseExecutor>({
    designator: ["list", "unstarted"],
    table: "appservice bot",
    parameters: parameters([]),
    command: async function () {
        return Ok(this.appservice.mjolnirManager.getUnstartedMjolnirs());
    },
    summary: "List any Mjolnir that failed to start."
});

// Hmm what if leter on we used OL and the numbers could be a presentation type
// and be used similar to like #=1 and #1.
defineMatrixInterfaceAdaptor({
    interfaceCommand: listUnstarted,
    renderer: async function (this: MatrixInterfaceAdaptor<MatrixContext, BaseFunction>, client: MatrixSendClient, commandRoomId: string, event: any, result: ActionResult<UnstartedMjolnir[]>) {
        tickCrossRenderer.call(this, client, commandRoomId, event, result); // don't await, it doesn't really matter.
        if (isError(result)) {
            return; // just let the default handler deal with it.
        }
        const unstarted = result.ok;
        await renderMatrixAndSend(
            <root>
                <b>Unstarted Mjolnir: {unstarted.length}</b>
                <ul>
                    {unstarted.map(mjolnir => {
                        return <li>
                            {mjolnir.mjolnirRecord.owner},
                            <code>{mjolnir.mxid.toString()}</code>
                            <code>{mjolnir.failCode}</code>:
                            <br />
                            {mjolnir.cause}
                        </li>
                    })}
                </ul>
            </root>,
            commandRoomId,
            event,
            client
        );
    }
})

// We need a "default" adaptor that needs to be explicitly defined still
// (since you need to know if you have not created an adaptor)
// but can be composed onto the end of existing adaptors easily
// e.g. read recipt and tick vs cross.
const restart = defineInterfaceCommand<AppserviceBaseExecutor>({
    designator: ["restart"],
    table: "appservice bot",
    parameters: parameters([
        {
            name: "mjolnir",
            acceptor: findPresentationType("UserID"),
            description: 'The userid of the mjolnir to restart'
        }
    ]),
    command: async function (this, _keywords, mjolnirId: UserID): Promise<ActionResult<true>> {
        const mjolnirManager = this.appservice.mjolnirManager;
        const mjolnir = mjolnirManager.findUnstartedMjolnir(mjolnirId.localpart);
        if (mjolnir?.mjolnirRecord === undefined) {
            return ActionError.Result(`We can't find the unstarted mjolnir ${mjolnirId}, is it running?`);
        }
        await mjolnirManager.startMjolnir(mjolnir?.mjolnirRecord);
        return Ok(true);
    },
    summary: "Attempt to restart a Mjolnir."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: restart,
    renderer: tickCrossRenderer
})

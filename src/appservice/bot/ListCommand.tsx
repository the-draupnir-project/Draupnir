/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { defineMatrixInterfaceAdaptor, MatrixContext, MatrixInterfaceAdaptor } from '../../commands/interface-manager/MatrixInterfaceAdaptor';
import { BaseFunction, defineInterfaceCommand } from '../../commands/interface-manager/InterfaceCommand';
import { findPresentationType, parameters } from '../../commands/interface-manager/ParameterParsing';
import { AppserviceBaseExecutor } from './AppserviceCommandHandler';
import { tickCrossRenderer } from '../../commands/interface-manager/MatrixHelpRenderer';
import { JSXFactory } from '../../commands/interface-manager/JSXFactory';
import { renderMatrixAndSend } from '../../commands/interface-manager/DeadDocumentMatrix';
import { ActionError, ActionResult, isError, Ok, UserID } from 'matrix-protection-suite';
import { MatrixSendClient } from 'matrix-protection-suite-for-matrix-bot-sdk';
import { UnstartedDraupnir } from '../../draupnirfactory/StandardDraupnirManager';

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
        return Ok(this.appservice.draupnirManager.getUnstartedDraupnirs());
    },
    summary: "List any Draupnir that failed to start."
});

// Hmm what if leter on we used OL and the numbers could be a presentation type
// and be used similar to like #=1 and #1.
defineMatrixInterfaceAdaptor({
    interfaceCommand: listUnstarted,
    renderer: async function (this: MatrixInterfaceAdaptor<MatrixContext, BaseFunction>, client: MatrixSendClient, commandRoomId: string, event: any, result: ActionResult<UnstartedDraupnir[]>) {
        tickCrossRenderer.call(this, client, commandRoomId, event, result); // don't await, it doesn't really matter.
        if (isError(result)) {
            return; // just let the default handler deal with it.
        }
        const unstarted = result.ok;
        await renderMatrixAndSend(
            <root>
                <b>Unstarted Mjolnir: {unstarted.length}</b>
                <ul>
                    {unstarted.map(draupnir => {
                        return <li>
                            <code>{draupnir.clientUserID}</code>
                            <code>{draupnir.failType}</code>:
                            <br />
                            {draupnir.cause}
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
            name: "draupnir",
            acceptor: findPresentationType("UserID"),
            description: 'The userid of the draupnir to restart'
        }
    ]),
    command: async function (this, _keywords, draupnirUser: UserID): Promise<ActionResult<void>> {
        const draupnirManager = this.appservice.draupnirManager;
        const draupnir = draupnirManager.findUnstartedDraupnir(draupnirUser.toString());
        if (draupnir !== undefined) {
            return ActionError.Result(`We can't find the unstarted draupnir ${draupnirUser}, is it already running?`);
        }
        return await draupnirManager.startDraupnirFromMXID(draupnirUser.toString());
    },
    summary: "Attempt to restart a Mjolnir."
})

defineMatrixInterfaceAdaptor({
    interfaceCommand: restart,
    renderer: tickCrossRenderer
})

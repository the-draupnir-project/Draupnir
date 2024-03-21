// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringUserID } from "matrix-protection-suite";
import { ClientForUserID, MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";

interface ClientProvider {
    findClientAsync: ClientForUserID;
}

/**
 * Implements `ClientForUserID` for the bot mode of Draupnir.
 * Introduced to allow us to use MPS from Draupnir's old Mjolnir integration
 * tests. Which we do want to eliminate soon, but we need to get them working
 * for Draupnir MPS first.
 *
 * DO NOT USE in the appservice unless you want to have memory leaks and a real
 * bad time.
 */
export class BotSDKManualClientProvider implements ClientProvider {
    private readonly clients = new Map<StringUserID, MatrixSendClient>();
    public constructor() {
        // nothing to do.
    }

    public findClient(clientUserID: StringUserID): MatrixSendClient {
        const entry = this.clients.get(clientUserID);
        if (entry === undefined) {
            throw new TypeError(`Cannot find a client for ${clientUserID}`);
        } else {
            return entry;
        }
    }

    public async findClientAsync(clientUserID: StringUserID): Promise<MatrixSendClient> {
        return this.findClient(clientUserID);
    }

    public toClientForUserID(): ClientForUserID {
        return this.findClientAsync.bind(this);
    }

    public addClient(clientUserID: StringUserID, client: MatrixSendClient): void {
        this.clients.set(clientUserID, client);
    }

    public removeClient(clientUserID: StringUserID): void {
        this.clients.delete(clientUserID);
    }
}

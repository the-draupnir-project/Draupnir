// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";
import { RendererMessage, RendererMessageCollector } from "./RendererMessageCollector";
import { DescriptionMeta, StringRoomID, Task } from "matrix-protection-suite";
import { DocumentNode } from "../commands/interface-manager/DeadDocument";
import { renderMatrixAndSend } from "../commands/interface-manager/DeadDocumentMatrix";
import { JSXFactory } from "../commands/interface-manager/JSXFactory";

export class DraupnirRendererMessageCollector implements RendererMessageCollector {
    constructor(
        private readonly client: MatrixSendClient,
        private readonly managementRoomID: StringRoomID,
    ) {
        // nothing to do.
    }
    private sendMessage(document: DocumentNode): void {
        Task((async () => {
            await renderMatrixAndSend(
                <root>{document}</root>,
                this.managementRoomID,
                undefined,
                this.client,
            )
        })());
    }
    addMessage(protection: DescriptionMeta, message: DocumentNode): void {
        this.sendMessage(message);
    }
    addOneliner(protection: DescriptionMeta, message: DocumentNode): void {
        this.sendMessage(<fragment><code>{protection.name}</code>: {message}</fragment>);
    }
    getMessages(): RendererMessage[] {
        return [];
    }
}

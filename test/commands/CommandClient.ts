/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 */

import { MatrixSendClient } from "../../src/MatrixEmitter";

/**
 * Do the ReadItems need to be readable?
 * Probably yes!!!
 */
export class MatrixInterfaceClient {
    constructor(
        private readonly client: MatrixSendClient,
        private readonly commandRoomId: string,
    ) {

    }

    public sendCommand
}

// so we have a few options
// ignore matrix and use the executor result
// try and verify the writen result
// i know which is easier....

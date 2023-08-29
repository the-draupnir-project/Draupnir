/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import EventEmitter from "events";
import { MatrixEmitter } from "../../MatrixEmitter";


// See https://github.com/Gnuxie/Draupnir/issues/13.
// The appservice bot does not support waiting for events yet.
export class AppserviceBotEmitter extends EventEmitter implements MatrixEmitter  {
    start(): Promise<void> {
        throw new Error("Method not implemented.");
    }
    stop(): void {
        throw new Error("Method not implemented.");
    }
}

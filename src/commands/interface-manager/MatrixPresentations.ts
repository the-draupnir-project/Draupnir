/**
 * Copyright (C) 2022 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ReadItem } from "./CommandReader";
import { makePresentationType, simpleTypeValidator } from "./ParamaterParsing";
import { UserID } from "matrix-bot-sdk";
import { MatrixRoomReference } from "./MatrixRoomReference";


makePresentationType({
    name: 'UserID',
    validator: simpleTypeValidator('UserID', (item: ReadItem) => item instanceof UserID),
})

makePresentationType({
    name: 'MatrixRoomReference',
    validator: simpleTypeValidator('MatrixRoomReference', (item: ReadItem) => item instanceof MatrixRoomReference),
})

/**
 * Copyright (C) 2022-2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { ReadItem } from "./CommandReader";
import { findPresentationType, makePresentationType, simpleTypeValidator } from "./ParamaterParsing";
import { UserID } from "matrix-bot-sdk";
import { MatrixRoomReference } from "./MatrixRoomReference";
import { definePresentationRenderer } from "./DeadDocumentPresentation";
import { JSXFactory } from "./JSXFactory";
import { DocumentNode } from "./DeadDocument";


makePresentationType({
    name: 'UserID',
    validator: simpleTypeValidator('UserID', (item: ReadItem) => item instanceof UserID),
})

makePresentationType({
    name: 'MatrixRoomReference',
    validator: simpleTypeValidator('MatrixRoomReference', (item: ReadItem) => item instanceof MatrixRoomReference),
})

// Wouldn't this be better as a custom document node so that we could render the plain text version differently?
definePresentationRenderer(findPresentationType('UserID'), function (presentation: UserID): DocumentNode {
    return <a href={`https://matrix.to/#/${presentation.toString()}`}>
        {presentation.toString()}
    </a>
})


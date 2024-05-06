/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { MatrixRoomAlias, MatrixRoomID } from "matrix-protection-suite";
import { DocumentNode } from "./DeadDocument"
import { PresentationType, findPresentationType, presentationTypeOf } from "./ParameterParsing";

type PresentationRenderer = (presentation: unknown) => DocumentNode;

const PRESENTATION_RENDERERS = new Map<PresentationType, PresentationRenderer>();

// don't forget that this is the equivalent of present and define-presentation-method.
export function definePresentationRenderer(presentationType: PresentationType, renderer: PresentationRenderer): void {
    if (PRESENTATION_RENDERERS.has(presentationType)) {
        throw new TypeError(`A DeadDocument renderer is already defined for the presentation type ${presentationType.name}`);
    } else {
        PRESENTATION_RENDERERS.set(presentationType, renderer);
    }
}

export function findPresentationRenderer(presentationType: PresentationType): PresentationRenderer {
    const entry = PRESENTATION_RENDERERS.get(presentationType);
    if (entry === undefined) {
        throw new TypeError(`There is no presentation renderer defined for the presentation type ${presentationType.name}`);
    }
    return entry;
}

export const DeadDocumentPresentationMirror = Object.freeze({
    present(object: unknown): DocumentNode {
        if (object instanceof MatrixRoomID || object instanceof MatrixRoomAlias) {
            return findPresentationRenderer(findPresentationType('MatrixRoomReference'))(object)
        } else {
            const presentationType = presentationTypeOf(object);
            if (presentationType !== undefined) {
                const renderer = findPresentationRenderer(presentationType);
                return renderer(object);
            } else {
                throw new TypeError(`Unable to present: ${object}`);
            }
        }
    }
})

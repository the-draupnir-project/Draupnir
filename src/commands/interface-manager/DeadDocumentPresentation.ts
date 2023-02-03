/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { DocumentNode } from "./DeadDocument"
import { PresentationType } from "./ParamaterParsing";

type PresentationRenderer = (presentation: unknown) => DocumentNode;

const PRESENTATION_RENDERERS = new Map<PresentationType, PresentationRenderer>();

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

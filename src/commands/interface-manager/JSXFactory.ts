/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { DocumentNode, LeafNode, makeDocumentNode, makeLeafNode, NodeTag, TextNode } from "./DeadDocument";
import { findPresentationRenderer } from "./DeadDocumentPresentation";
import { presentationTypeOf } from "./ParamaterParsing";

type rawJSX = DocumentNode|LeafNode|string|number|Array<rawJSX>;

export function JSXFactory(tag: NodeTag, properties: any, ...rawChildren: (DocumentNode|LeafNode|string)[]) {
    const node = makeDocumentNode(tag);
    // why not just give nodes the properties object??
    if (properties) {
        for (const [key, value] of Object.entries(properties)) {
            node.attributeMap.set(key, value);
        }
    }
    const ensureChild = (rawChild: rawJSX) => {
        if (typeof rawChild === 'string') {
            makeLeafNode<TextNode>(NodeTag.TextNode, node, rawChild);
        } else if (typeof rawChild === 'number') {
            makeLeafNode<TextNode>(NodeTag.TextNode, node, (rawChild as number).toString());
        } else if (Array.isArray(rawChild)) {
            rawChild.forEach(ensureChild);
        } else if (typeof rawChild.leafNode === 'boolean') {
            node.addChild(rawChild);
        } else {
            const presentationType = presentationTypeOf(rawChild);
            if (presentationType !== undefined) {
                const renderer = findPresentationRenderer(presentationType);
                node.addChild(renderer(rawChild));
            } else {
                throw new TypeError(`Unexpected raw child ${JSON.stringify(rawChild)}`);
            }
        }
    }
    rawChildren.forEach(ensureChild);
    return node;
}


namespace JSXFactory {
    export interface IntrinsicElements {
        [elemName: string]: any;
    }
}

/**
 * Pisses me off that tooling is too dumb to use the above
 * https://www.typescriptlang.org/docs/handbook/declaration-merging.html
 * https://www.typescriptlang.org/tsconfig#jsxFactory
 */
declare global {
    export namespace JSX {
        export interface IntrinsicElements {
            [elemName: string]: any;
        }
    }
}


/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { DocumentNode, LeafNode, makeDocumentNode, makeLeafNode, NodeTag, TextNode } from "./DeadDocument";

declare global {
    namespace JSX {
        interface IntrinsicElements {
            [elemName: string]: any;
        }
    }
}

export function JSXFactory(tag: NodeTag, properties: any, ...rawChildren: (DocumentNode|LeafNode|string)[]) {
    const node = makeDocumentNode(tag);
    const ensureChild = (rawChild: DocumentNode|LeafNode|string) => {
        if (typeof rawChild === 'string') {
            return makeLeafNode<TextNode>(NodeTag.TextNode, node, rawChild);
        } else {
            node.addChild(rawChild);
            return rawChild;
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


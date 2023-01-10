/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

export interface IDocumentNodeProtoype {
    readonly parent: DocumentNode|null;
    addText(data: string): TextNode;
    addInlineCode(data: string): InlineCodeNode;
    readonly leafNode: false;
}

export interface DocumentNode extends IDocumentNodeProtoype {
    addChild<Node extends DocumentNode|LeafNode>(node: Node): Node
    getChildren(): (DocumentNode|LeafNode)[]
}


// These are NOT HTML tags.
export enum NodeTag {
    TextNode = 'text',
    InlineCode = 'inline-code',
    PreformattedText = 'preformatted-text',
}

export interface LeafNode {
    readonly tag: NodeTag,
    readonly parent: DocumentNode,
    readonly data: string,
    readonly leafNode: true,
}

export function makeLeafNode<LeafInterface extends LeafNode>(tag: LeafInterface['tag'], parent: DocumentNode, data: string): LeafInterface {
    return { tag, parent, data, leafNode: true } as LeafInterface;
}

export interface TextNode extends LeafNode {
    readonly tag: NodeTag.TextNode;
}

// lol no mixins so addChild  can't be protected on DocumentNode
// it's a yoke.
export function addText(this: DocumentNode, data: string): TextNode {
    return this.addChild(makeLeafNode<TextNode>(NodeTag.TextNode, this, data))
}

export interface InlineCodeNode extends LeafNode {
    readonly tag: NodeTag.InlineCode;
}

export function addInlineCode(this: DocumentNode, data: string): InlineCodeNode {
    return this.addChild(makeLeafNode<InlineCodeNode>(NodeTag.InlineCode, this, data));
} 

export interface PreformattedTextNode extends LeafNode {
    readonly tag: NodeTag.PreformattedText;
}

export function addPreformattedText(this: DocumentNode, data: string): PreformattedTextNode {
    return this.addChild(makeLeafNode<PreformattedTextNode>(NodeTag.PreformattedText, this, data));
}

function nextSibling(node: DocumentNode|LeafNode): DocumentNode|LeafNode|undefined {
    if (node.parent) {
        const nodePosition = node.parent.getChildren().indexOf(node);
        if (nodePosition === -1) {
            throw new TypeError(`Badly constructed parent node for ${node}, apparently this node is not a child.`);
        }
        return node.parent.getChildren().at(nodePosition + 1);
    }
    return undefined;
}


/**
 * We use a Fringe to render.
 */

export enum FringeType {
    Pre = 'pre',
    Leaf = 'leaf',
    Post = 'post',
}

type AnnotatedFringeNode = {
    type: FringeType,
    node: DocumentNode|LeafNode
};

type Flat = AnnotatedFringeNode[];
// https://dl.acm.org/doi/pdf/10.1145/165507.165514
// If performance becomes a concern then a generator should be written
// but for rendering incrementally i think constructing the fringe is acceptable.
// So long as no one uses `Flat` directly and there's some inversion of control
// then we'll be fine.
function fringeInternalNode(node: DocumentNode, flat: Flat): Flat {
    if (node.getChildren().length === 0) {
        return flat;
    } else {
        return node.getChildren().reduce((previous: Flat, child: DocumentNode|LeafNode) => {
            return fringe(child, previous);
        }, flat);
    }
}

function fringe(node: DocumentNode|LeafNode, flat: Flat = []): Flat {
    if (node.leafNode) {
        flat.push({ type: FringeType.Leaf, node });
        return flat;
    } else {
        flat.push({ type: FringeType.Pre, node });
        flat = fringeInternalNode(node, flat);
        flat.push({ type: FringeType.Post, node });
        return flat;
    }
}
export type FringeLeafRenderFunction<Context> = (tag: NodeTag, node:LeafNode, context: Context) => void

export interface FringeRenderer<Context> {
    getLeafRenderer(tag: NodeTag): FringeLeafRenderFunction<Context>
}

/**
 * The FringeWalker allows for the implementation of an incremental
 * renderer.
 * Each increment is defined by the fist leaf node to be rendered
 * or the first inner node to have all of its leaves renderered.
 * @param Context is a static context that should be provided to each render function.
 */
export class FringeWalker<Context> {
    private readonly fringe: Flat;
    constructor(
        private readonly root: DocumentNode,
        private readonly context: Context,
        private readonly renderer: FringeRenderer<Context>,
    ) {
        this.fringe = fringe(root);
    }

    public increment(): DocumentNode|LeafNode {
        for (const node of this.fringe) {
            if (node.type === FringeType.Pre) {
                this.renderer.getRenderer(node.node)
            }
        }
    }
}
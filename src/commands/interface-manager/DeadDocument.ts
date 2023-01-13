/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { SuperCoolStream } from "./CommandReader";

export interface AbstractNode {
    readonly parent: DocumentNode|null;
    readonly leafNode: boolean;
    readonly tag: NodeTag;
}

export interface DocumentNode extends AbstractNode {
    readonly leafNode: false;
    addChild<Node extends DocumentNode|LeafNode>(node: Node): Node
    getChildren(): (DocumentNode|LeafNode)[]
    getFirstChild(): DocumentNode|LeafNode|undefined;
}

export interface LeafNode extends AbstractNode {
    readonly parent: DocumentNode,
    readonly data: string,
    readonly leafNode: true,
}

// These are NOT necessarily HTML tags.
export enum NodeTag {
    TextNode = 'text',
    InlineCode = 'code',
    PreformattedText = 'pre',
    Root = 'root',
    Strong = 'strong',
    Emphasis = 'em',
    Paragraph = 'p',
    HeadingOne = 'h1',
    UnorderedList = 'ul',
    ListItem = 'li'
}

/**
 * This is an internal interface so we can provide
 * an implementation of `DocumentNode` in a way
 * where we can use ad-hoc mixins.
 */
interface DeadDocumentNode extends DocumentNode {
    children: (DocumentNode|LeafNode)[];
}

export function addChild<Node extends DocumentNode|LeafNode>(this: DeadDocumentNode, node: Node): Node {
    if (this.children.includes(node)) {
        return node;
    }
    this.children.push(node);
    return node;
}

export function getChildren(this: DeadDocumentNode): (DocumentNode|LeafNode)[] {
    return this.children;
}

export function getFirstChild(this: DeadDocumentNode): DocumentNode|LeafNode|undefined {
    return this.children.at(0);
}

export function makeDocumentNode(tag: NodeTag, parent = null): DocumentNode {
    const node: DeadDocumentNode = {
        tag,
        leafNode: false,
        parent,
        children: [],
        addChild,
        getChildren,
        getFirstChild,
    };
    return node;
}


export function makeLeafNode<LeafInterface extends LeafNode>(tag: LeafInterface['tag'], parent: DocumentNode, data: string): LeafInterface {
    const leaf = { tag, parent, data, leafNode: true } as LeafInterface;
    parent.addChild(leaf);
    return leaf;
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
export type FringeLeafRenderFunction<Context> = (tag: NodeTag, node: LeafNode, context: Context) => void
export type FringeInnerRenderFunction<Context> = (type: FringeType, node: DocumentNode, context: Context, environment: TagDynamicEnvironment) => void; 

export interface FringeRenderer<Context> {
    getLeafRenderer(tag: NodeTag): FringeLeafRenderFunction<Context>
    getPreRenderer(tag: NodeTag): FringeInnerRenderFunction<Context>;
    getPostRenderer(tag: NodeTag): FringeInnerRenderFunction<Context>;
}

export class SimpleFringeRenderer<Context> implements FringeRenderer<Context> {
    private readonly preRenderers = new Map<NodeTag, FringeInnerRenderFunction<Context>>();
    private readonly leafRenderers = new Map<NodeTag, FringeLeafRenderFunction<Context>>();
    private readonly postRenderers = new Map<NodeTag, FringeInnerRenderFunction<Context>>();
    constructor() {

    }

    private getRenderer<T>(table: Map<NodeTag, T>, type: FringeType, tag: NodeTag): T {
        const entry = table.get(tag);
        if (entry) {
            return entry;
        }
        throw new TypeError(`Couldn't find a ${type} renderer for ${tag}`);
    }

    public getPreRenderer(tag: NodeTag): FringeInnerRenderFunction<Context> {
        return this.getRenderer(this.preRenderers, FringeType.Pre, tag);
    }

    public getLeafRenderer(tag: NodeTag): FringeLeafRenderFunction<Context> {
        return this.getRenderer(this.leafRenderers, FringeType.Leaf, tag);
    }

    public getPostRenderer(tag: NodeTag): FringeInnerRenderFunction<Context> {
        return this.getRenderer(this.postRenderers, FringeType.Post, tag);
    }

    public internRenderer<T extends FringeInnerRenderFunction<Context>|FringeLeafRenderFunction<Context>>(type: FringeType, tag: NodeTag, table: Map<NodeTag, T>, renderer: T): void {
        if (table.has(tag)) {
            throw new TypeError(`There is already a renderer registered for ${type} ${tag}`);
        }
        table.set(tag, renderer);
    }

    public registerRenderer<T extends FringeInnerRenderFunction<Context>|FringeLeafRenderFunction<Context>>(type: FringeType, tag: NodeTag, renderer: T): SimpleFringeRenderer<Context> {
        // The casting in here is evil. Not sure how to fix it.
        switch(type) {
            case FringeType.Pre:
                this.internRenderer<T>(type, tag, this.preRenderers as Map<NodeTag, T>, renderer);
                break;
            case FringeType.Leaf:
                this.internRenderer<T>(type, tag, this.leafRenderers as Map<NodeTag, T>, renderer);
                break;
            case FringeType.Post:
                this.internRenderer<T>(type, tag, this.postRenderers as Map<NodeTag, T>, renderer);
                break;
        }
        return this;
    }

    public registerInnerNode(tag: NodeTag, pre: FringeInnerRenderFunction<Context>, post: FringeInnerRenderFunction<Context>): SimpleFringeRenderer<Context> {
        this.internRenderer(FringeType.Pre, tag, this.preRenderers, pre);
        this.internRenderer(FringeType.Post, tag, this.postRenderers, post);
        return this;
    }
}

const COMMITTABLE_NODES = new Set([
    NodeTag.HeadingOne,
    NodeTag.ListItem,
    NodeTag.Paragraph,
    NodeTag.PreformattedText,
    NodeTag.UnorderedList
]);

class FringeStream extends SuperCoolStream<Flat> {

}

export type CommitHook<Context> = (node: DocumentNode, context: Context) => void;

/**
 * The FringeWalker allows for the implementation of an incremental
 * renderer.
 * Each increment is defined by the fist leaf node to be rendered
 * or the first inner node to have all of its leaves renderered.
 * @param Context is a static context that should be provided to each render function.
 */
export class FringeWalker<Context> {
    private readonly stream: FringeStream;
    private readonly dynamicEnvironment = new TagDynamicEnvironment();
    constructor(
        public readonly root: DocumentNode,
        private readonly context: Context,
        private readonly renderer: FringeRenderer<Context>,
        private readonly commitHook: CommitHook<Context>
    ) {
        this.stream = new FringeStream(fringe(root));
    }

    public increment(): DocumentNode|undefined {
        const renderInnerNode = (node: AnnotatedFringeNode) => {
            if (node.node.leafNode) {
                throw new TypeError("Leaf nodes should not be in the Pre/Post position");
            }
            const renderer = node.type === FringeType.Pre
                ? this.renderer.getPreRenderer(node.node.tag)
                : this.renderer.getPostRenderer(node.node.tag);
            renderer(node.type, node.node, this.context, this.dynamicEnvironment);
            return node.node;
        }
        const postNode = (node: AnnotatedFringeNode): DocumentNode => {
            if (node.node.leafNode) {
                throw new TypeError("Leaf nodes should not be in the Pre/Post position");
            }
            renderInnerNode(node);
            this.dynamicEnvironment.pop(node.node);
            return node.node;
        }
        while(!COMMITTABLE_NODES.has(this.stream.peekItem()?.node.tag)) {
            const node = this.stream.readItem();
            switch(node.type) {
                case FringeType.Pre:
                    renderInnerNode(node);
                    break;
                case FringeType.Post:
                    postNode(node);
                    break;
                case FringeType.Leaf:
                    if (node.node.leafNode !== true) {
                        throw new TypeError("Leaf nodes should not be marked as an inner node");
                    }
                    this.renderer.getLeafRenderer(node.node.tag)(node.node.tag, node.node as unknown as LeafNode, this.context);
                    break;
                default:
                    throw new TypeError(`Uknown fringe type ${node.type}`);
            }
        }
        if (this.stream.peekItem() === undefined) {
            return undefined;
        }
        const node = this.stream.readItem();
        postNode(node);
        this.commitHook(node, this.context);
        return node;
    }
}

export interface TagDynamicEnvironmentEntry {
    node: DocumentNode,
    value: any,
}

export class TagDynamicEnvironment {
    private readonly environments = new Map<NodeTag, TagDynamicEnvironmentEntry[]>();

    public getEnvironment(tag: NodeTag): TagDynamicEnvironmentEntry[] {
        return this.environments.get(tag)
            ?? ((bootstrap: TagDynamicEnvironmentEntry[]) => (this.environments.set(tag, bootstrap), bootstrap))([]);
    }

    public bind(node: DocumentNode, value: any) {
        const entry = this.getEnvironment(node.tag);
        entry.push({ node, value });
    }

    public pop(node: DocumentNode) {
        const entry = this.getEnvironment(node.tag);
        if (Object.is(entry.at(0), node)) {
            entry.pop();
        }
    }
}

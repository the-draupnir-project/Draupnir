/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { DocumentNode, FringeInnerRenderFunction, FringeLeafRenderFunction, FringeType, LeafNode, NodeTag, SimpleFringeRenderer } from "./DeadDocument";

// This just doesn't work.
// the transactions have to be managed by the Matrix renderer
// which is basically a different walker
// that renders the node twice.
// The first thing to get full we stop.
// this is possible if we make an iterator that just renders 1 node at a time
export class TransactionalOutputStream {
    private buffer: string = '';
    public output: string = '';
    private lastCommittedNode?: DocumentNode;
    constructor(
        public readonly sizeLimit = 20_000,
    ) {

    }

    public writeString(string: string): TransactionalOutputStream {
        this.buffer += string;
        return this;
    }

    public getPosition(): number {
        return this.buffer.length;
    }

    private adjust(source: string, target: string): void {
        if (source.at(-2) === '\n' && source.at(-1) === '\n') return;
        if (source.at(-1) === '\n') {
            target += '\n';
            return;
        }
        target += '\n\n';
    }

    public adjustForNextElement(): void {
        this.adjust(this.buffer, this.buffer)
    }

    public commit(node: DocumentNode): void {
        if ((this.output.length + this.buffer.length) > this.sizeLimit) {
            throw new Error("Unable to commit blah blah FIXME")
        }
        this.output += this.buffer;
        this.buffer = '';
        this.adjust(this.output, this.buffer);
        this.lastCommittedNode = node;
    }

    public getLastCommittedNode(): DocumentNode|undefined {
        return this.lastCommittedNode;
    }
}

export interface TransactionalOutputContext {
    output: TransactionalOutputStream
}

export function staticString(string: string): FringeInnerRenderFunction<TransactionalOutputContext> {
    return function(_fringe: FringeType, _node: DocumentNode, context: TransactionalOutputContext) {
        context.output.writeString(string)
    }
}
export function blank() { }



export const MARKDOWN_RENDERER = new SimpleFringeRenderer<TransactionalOutputContext>();


MARKDOWN_RENDERER.registerRenderer<FringeLeafRenderFunction<TransactionalOutputContext>>(
    FringeType.Leaf,
    NodeTag.TextNode,
    function (tag: NodeTag, node: LeafNode, context: TransactionalOutputContext) {
        context.output.writeString(node.data);
    }
).registerInnerNode(NodeTag.HeadingOne,
    function (_fringeType, _node, context: TransactionalOutputContext) { context.output.writeString('# ') },
    staticString('\n\n'),
).registerInnerNode(NodeTag.Emphasis,
    staticString('*'),
    staticString('*')
).registerInnerNode(NodeTag.InlineCode,
    staticString('`'),
    staticString('`')
).registerInnerNode(NodeTag.Paragraph,
    blank,
    staticString('\n\n')
).registerInnerNode(NodeTag.PreformattedText,
    staticString('```\n'),
    staticString('```\n')
).registerInnerNode(NodeTag.Strong,
    staticString('**'),
    staticString('**')
);
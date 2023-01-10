/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { DocumentNode, NodeTag } from "./DeadDocument";

// This just doesn't work.
// the transactions have to be managed by the Matrix renderer
// which is basically a different walker
// that renders the node twice.
// The first thing to get full we stop.
// this is possible if we make an iterator that just renders 1 node at a time
class TransactionalOutputStream {
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

type NodeRenderer = (node: DocumentNode, stream: TransactionalOutputStream) => void;

const NODE_RENDERERS = new Map<NodeTag, NodeRenderer>();

function defineNodeRenderer(tag: NodeTag, renderer: NodeRenderer): NodeRenderer {
    if (NODE_RENDERERS.has(tag)) {
        throw new TypeError(`There was already a renderer registered for ${tag}`);
    }
    NODE_RENDERERS.set(tag, render);
    return render
}

function findNodeRenderer(tag: NodeTag): NodeRenderer {
    const entry = NODE_RENDERERS.get(tag)
    if (entry) {
        return entry;
    }
    throw new TypeError(`Couldn't find a renderer for the tag ${tag}`);
}

function callNodeRendererForChildren(tag: NodeTag, node: DocumentNode): void {
    // The problem is that we want to control message length and split semantically
    // so this renderer will not work.
}

function render(document: DocumentNode): string {
    const stream = new TransactionalOutputStream();
    renderDocumentNote(document, stream);
    return stream.output;
}

function renderDocumentNote(node: DocumentNode, stream: TransactionalOutputStream): void {
    const previousPosition = stream.getPosition();

    if (stream.getPosition() !== previousPosition) {
        stream.adjustForNextElement();
    }
}

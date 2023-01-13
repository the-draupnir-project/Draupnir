/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { DocumentNode, FringeInnerRenderFunction, FringeLeafRenderFunction, FringeType, LeafNode, NodeTag, SimpleFringeRenderer, TagDynamicEnvironment } from "./DeadDocument";

/**
 * Ideally this would call a callback when a page is ready
 * Unfortunatley there's no way to do that (and await) without making the stream
 * all async. Which is annoying af.
 * Therefore it's necessary for the stream to queue pages
 */
export class PagedDuplexStream {
    private buffer: string = '';
    private pages: string[] = [''];

    private lastCommittedNode?: DocumentNode;
    constructor(
        public readonly sizeLimit = 20_000,
    ) {
    }

    private get currentPage(): string {
        return this.pages.at(this.pages.length - 1)!;
    }

    private appendToCurrentPage(string: string) {
        const currentIndex = this.pages.length - 1;
        this.pages[currentIndex] = this.pages[currentIndex] + string;
    }

    public writeString(string: string): PagedDuplexStream {
        this.buffer += string;
        return this;
    }

    public getPosition(): number {
        return this.buffer.length;
    }

    public isPageAndBufferOverSize(): boolean {
        return (this.currentPage.length + this.buffer.length) > this.sizeLimit;
    }

    /**
     * Creates a new page from the previously committed text
     * @returns A page with all committed text.
     */
    public ensureNewPage(): void {
        if (this.currentPage.length !== 0) {
            this.pages.push('');
        }
    }

    /**
     * Commit the buffered text to the current page.
     * If the buffered text is over the `sizeLimit`, then the current
     * page will be returned first, and then replaced with a new one in order
     * to commit the buffer.
     * @param node A DocumentNode to associate with the commit.
     * @throws TypeError if the buffer is larger than the `sizeLimit`.
     * @returns A page if the buffered text will force the current page to go over the size limit.
     */
    public commit(node: DocumentNode): void {
        if (this.isPageAndBufferOverSize()) {
            if (this.currentPage.length === 0 && (this.buffer.length > this.sizeLimit)) {
                throw new TypeError('Commit is too large, could not write a page for this commit');
            }
            this.ensureNewPage();
            this.appendToCurrentPage(this.buffer);
            this.lastCommittedNode = node;
        } else {
            this.appendToCurrentPage(this.buffer);
            this.buffer = '';
            this.lastCommittedNode = node;
        }
    }

    public getLastCommittedNode(): DocumentNode|undefined {
        return this.lastCommittedNode;
    }

    public peekPage(): string|undefined {
        return this.pages.at(0);
    }

    public readPage(): string|undefined {
        return this.pages.shift();
    }
}

/**
 * Hoping to replace this soon? or subclass
 * FringeWalker so this is just a stream?
 * THen Markdown and HTML renderers are simplified and
 * other people can still use the fringe walker.
 */
export interface TransactionalOutputContext {
    output: PagedDuplexStream
}

export function staticString(string: string): FringeInnerRenderFunction<TransactionalOutputContext> {
    return function(_fringe: FringeType, _node: DocumentNode, context: TransactionalOutputContext) {
        context.output.writeString(string)
    }
}
export function blank() { }
export function incrementDynamicEnvironment(_fringe: FringeType, node: DocumentNode, _context: TransactionalOutputContext, environment: TagDynamicEnvironment) {
    const entry = environment.getEnvironment(node.tag).at(0);
    if (entry) {
        if (!Number.isInteger(entry.value)) {
            throw new TypeError(`${node.tag} should not have a dynamic environment entry that isn't an integer`);
        }
        environment.bind(node, entry.value + 1);
    }
}


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
).registerInnerNode(NodeTag.UnorderedList,
    incrementDynamicEnvironment,
    blank
).registerInnerNode(NodeTag.ListItem,
    function(_fringe: FringeType, node: DocumentNode, context: TransactionalOutputContext, environment: TagDynamicEnvironment) {
        const entry = environment.getEnvironment(node.tag).at(0);
        if (!Number.isInteger(entry?.value)) {
            throw new TypeError(`Cannot render the list ${node.tag} because someone clobbered the dynamic environment, should only have integers`)
        }
        context.output.writeString('\n');
        for (let i = 0; i < entry?.value; i++) {
            context.output.writeString('    ');
        }
        context.output.writeString(' * ');
    },
    staticString('\n')
).registerInnerNode(NodeTag.LineBreak,
    blank,
    staticString('\n')
);

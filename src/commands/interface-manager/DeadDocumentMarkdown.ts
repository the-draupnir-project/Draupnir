/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { DocumentNode, FringeInnerRenderFunction, FringeLeafRenderFunction, FringeType, LeafNode, NodeTag, SimpleFringeRenderer, TagDynamicEnvironment } from "./DeadDocument";
import { PagedDuplexStream } from "./PagedDuplexStream";

export enum MarkdownVariables {
    IndentationLevel = "indentation level"
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
    const value = environment.getVariable(MarkdownVariables.IndentationLevel);
    if (value) {
        if (!Number.isInteger(value)) {
            throw new TypeError(`${MarkdownVariables.IndentationLevel} should not have a dynamic environment entry that isn't an integer`);
        }
        environment.bind(MarkdownVariables.IndentationLevel, node, value + 1);
    } else {
        environment.bind(MarkdownVariables.IndentationLevel, node, 1);
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
        const indentationLevel: number = (() => {
            const value = environment.getVariable(MarkdownVariables.IndentationLevel);
             if (!Number.isInteger(value)) {
                throw new TypeError(`Cannot render the list ${node.tag} because someone clobbered the dynamic environment, should only have integers. Did you forget to enclose in <ul> or <ol>?`)
            } else {
                return value;
            }
        })();

        context.output.writeString('\n');
        for (let i = 0; i < indentationLevel; i++) {
            context.output.writeString('    ');
        }
        context.output.writeString(' * ');
    },
    staticString('\n')
).registerInnerNode(NodeTag.LineBreak,
    blank,
    staticString('\n')
).registerInnerNode(NodeTag.BoldFace,
    staticString('**'),
    staticString('**')
).registerInnerNode(NodeTag.ItalicFace,
    staticString('*'),
    staticString('*')
);

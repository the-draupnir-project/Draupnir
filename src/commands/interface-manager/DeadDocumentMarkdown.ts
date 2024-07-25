// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  DocumentNode,
  FringeInnerRenderFunction,
  FringeLeafRenderFunction,
  FringeType,
  LeafNode,
  NodeTag,
  SimpleFringeRenderer,
  TagDynamicEnvironment,
} from "./DeadDocument";
import { PagedDuplexStream } from "./PagedDuplexStream";

export enum MarkdownVariables {
  IndentationLevel = "indentation level",
  ListType = "List Type",
  ListItemCount = "List Item Count",
}

/**
 * Hoping to replace this soon? or subclass
 * FringeWalker so this is just a stream?
 * THen Markdown and HTML renderers are simplified and
 * other people can still use the fringe walker.
 */
export interface TransactionalOutputContext {
  output: PagedDuplexStream;
}

export function staticString(
  string: string
): FringeInnerRenderFunction<TransactionalOutputContext> {
  return function (
    _fringe: FringeType,
    _node: DocumentNode,
    context: TransactionalOutputContext
  ) {
    context.output.writeString(string);
  };
}
export function blank() {}
export function incrementDynamicEnvironment(
  _fringe: FringeType,
  node: DocumentNode,
  _context: TransactionalOutputContext,
  environment: TagDynamicEnvironment
) {
  const value = (() => {
    try {
      return environment.read<undefined | number>(
        MarkdownVariables.IndentationLevel
      );
    } catch (_e: unknown) {
      return environment.bind(MarkdownVariables.IndentationLevel, node, 0);
    }
  })();
  if (value) {
    if (!Number.isInteger(value)) {
      throw new TypeError(
        `${MarkdownVariables.IndentationLevel} should not have a dynamic environment entry that isn't an integer`
      );
    }
    environment.bind(MarkdownVariables.IndentationLevel, node, value + 1);
  }
}

export const MARKDOWN_RENDERER =
  new SimpleFringeRenderer<TransactionalOutputContext>();

MARKDOWN_RENDERER.registerRenderer<
  FringeLeafRenderFunction<TransactionalOutputContext>
>(
  FringeType.Leaf,
  NodeTag.TextNode,
  function (tag: NodeTag, node: LeafNode, context: TransactionalOutputContext) {
    context.output.writeString(node.data);
  }
)
  .registerInnerNode(
    NodeTag.HeadingOne,
    function (_fringeType, _node, context: TransactionalOutputContext) {
      context.output.writeString("# ");
    },
    staticString("\n\n")
  )
  .registerInnerNode(NodeTag.Emphasis, staticString("*"), staticString("*"))
  .registerInnerNode(NodeTag.InlineCode, staticString("`"), staticString("`"))
  .registerInnerNode(NodeTag.Paragraph, blank, staticString("\n\n"))
  .registerInnerNode(
    NodeTag.PreformattedText,
    staticString("```\n"),
    staticString("```\n")
  )
  .registerInnerNode(NodeTag.Strong, staticString("**"), staticString("**"))
  .registerInnerNode(
    NodeTag.UnorderedList,
    function (
      fringe: FringeType,
      node: DocumentNode,
      context: TransactionalOutputContext,
      environment: TagDynamicEnvironment
    ) {
      incrementDynamicEnvironment(fringe, node, context, environment);
      environment.bind(MarkdownVariables.ListType, node, NodeTag.UnorderedList);
      environment.bind(MarkdownVariables.ListItemCount, node, 0);
    },
    blank
  )
  .registerInnerNode(
    NodeTag.ListItem,
    function (_fringe, node, context, environment) {
      const indentationLevel: number = (() => {
        const value = environment.read<number>(
          MarkdownVariables.IndentationLevel
        );
        if (!Number.isInteger(value)) {
          throw new TypeError(
            `Cannot render the list ${node.tag} because someone clobbered the dynamic environment, should only have integers. Did you forget to enclose in <ul> or <ol>?`
          );
        } else {
          return value;
        }
      })();
      const listItemCount = (() => {
        const currentCount = environment.read<number>(
          MarkdownVariables.ListItemCount
        );
        if (!Number.isInteger(currentCount)) {
          throw new TypeError(
            `Cannot render the list ${node.tag} because someone clobbered the dynamic environment.`
          );
        }
        environment.write(MarkdownVariables.ListItemCount, currentCount + 1);
        return currentCount + 1;
      })();
      context.output.writeString("\n");
      for (let i = 0; i < indentationLevel; i++) {
        context.output.writeString("    ");
      }
      if (
        environment.read(MarkdownVariables.ListType) === NodeTag.OrderedList
      ) {
        context.output.writeString(` ${listItemCount}. `);
      } else {
        context.output.writeString(" * ");
      }
    },
    staticString("\n")
  )
  .registerInnerNode(
    NodeTag.OrderedList,
    function (
      fringe: FringeType,
      node: DocumentNode,
      context: TransactionalOutputContext,
      environment: TagDynamicEnvironment
    ) {
      incrementDynamicEnvironment(fringe, node, context, environment);
      environment.bind(MarkdownVariables.ListType, node, NodeTag.OrderedList);
      environment.bind(MarkdownVariables.ListItemCount, node, 0);
    },
    blank
  )
  .registerInnerNode(NodeTag.LineBreak, blank, staticString("\n"))
  .registerInnerNode(NodeTag.BoldFace, staticString("**"), staticString("**"))
  .registerInnerNode(NodeTag.ItalicFace, staticString("*"), staticString("*"))
  .registerInnerNode(
    NodeTag.Anchor,
    staticString("["),
    function (_fringe, node, context, _environment) {
      const href = node.attributeMap.get("href");
      if (href === undefined) {
        throw new TypeError(
          "Anchor without a href is probably a mistake? well we do not support other uses yet."
        );
      }
      context.output.writeString(`](${href})`);
    }
  )
  .registerInnerNode(NodeTag.Root, blank, blank)
  .registerInnerNode(
    NodeTag.Details,
    staticString("<details>"),
    staticString("</details>")
  )
  .registerInnerNode(
    NodeTag.Summary,
    staticString("<summary>"),
    staticString("</summary>")
  )
  .registerInnerNode(NodeTag.Font, blank, blank)
  .registerInnerNode(NodeTag.Span, blank, blank);

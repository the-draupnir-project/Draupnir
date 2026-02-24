// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  DocumentNode,
  FringeLeafRenderFunction,
  FringeType,
  LeafNode,
  NodeTag,
  SimpleFringeRenderer,
  TagDynamicEnvironment,
} from "./DeadDocument";
import {
  TransactionalOutputContext,
  blank,
  staticString,
} from "./DeadDocumentMarkdown";
import { escapeHTML } from "./escapeHTML";

function writeAttributableNode(
  tagName: string,
  _fringe: FringeType,
  node: DocumentNode,
  context: TransactionalOutputContext,
  _environment: TagDynamicEnvironment
) {
  context.output.writeString(`<${tagName}`);
  if (node.attributeMap.size > 0) {
    for (const [key, value] of node.attributeMap.entries()) {
      context.output.writeString(` ${escapeHTML(key)}="${escapeHTML(value)}"`);
    }
  }
  context.output.writeString(">");
}

function attributableNode(tagName: string) {
  return function (
    fringe: FringeType,
    node: DocumentNode,
    context: TransactionalOutputContext,
    environment: TagDynamicEnvironment
  ) {
    writeAttributableNode(tagName, fringe, node, context, environment);
  };
}

export const HTML_RENDERER =
  new SimpleFringeRenderer<TransactionalOutputContext>();

HTML_RENDERER.registerRenderer<
  FringeLeafRenderFunction<TransactionalOutputContext>
>(
  FringeType.Leaf,
  NodeTag.TextNode,
  function (
    _tag: NodeTag,
    node: LeafNode,
    context: TransactionalOutputContext
  ) {
    context.output.writeString(escapeHTML(node.data));
  }
)
  .registerInnerNode(
    NodeTag.Emphasis,
    staticString("<em>"),
    staticString("</em>")
  )
  .registerInnerNode(
    NodeTag.HeadingOne,
    staticString("<h1>"),
    staticString("</h1>")
  )
  .registerInnerNode(
    NodeTag.HeadingTwo,
    staticString("<h2>"),
    staticString("</h2>")
  )
  .registerInnerNode(
    NodeTag.HeadingThree,
    staticString("<h3>"),
    staticString("</h3>")
  )
  .registerInnerNode(
    NodeTag.HeadingFour,
    staticString("<h4>"),
    staticString("</h4>")
  )
  .registerInnerNode(
    NodeTag.HeadingFive,
    staticString("<h5>"),
    staticString("</h5>")
  )
  .registerInnerNode(
    NodeTag.HeadingSix,
    staticString("<h6>"),
    staticString("</h6>")
  )
  .registerInnerNode(NodeTag.HorizontalRule, blank, staticString("<hr/>"))
  .registerInnerNode(
    NodeTag.InlineCode,
    staticString("<code>"),
    staticString("</code>")
  )
  .registerInnerNode(
    NodeTag.Paragraph,
    staticString("<p>"),
    staticString("</p>")
  )
  .registerInnerNode(
    NodeTag.PreformattedText,
    staticString("<pre>"),
    staticString("</pre>")
  )
  .registerInnerNode(
    NodeTag.Strong,
    staticString("<strong>"),
    staticString("</strong>")
  )
  .registerInnerNode(
    NodeTag.UnorderedList,
    staticString("<ul>"),
    staticString("</ul>")
  )
  .registerInnerNode(
    NodeTag.OrderedList,
    staticString("<ol>"),
    staticString("</ol>")
  )
  .registerInnerNode(
    NodeTag.ListItem,
    staticString("<li>"),
    staticString("</li>")
  )
  .registerInnerNode(NodeTag.LineBreak, blank, staticString("<br/>"))
  .registerInnerNode(
    NodeTag.BoldFace,
    staticString("<b>"),
    staticString("</b>")
  )
  .registerInnerNode(
    NodeTag.ItalicFace,
    staticString("<i>"),
    staticString("</i>")
  )
  .registerInnerNode(
    NodeTag.Anchor,
    attributableNode("a"),
    staticString("</a>")
  )
  .registerInnerNode(
    NodeTag.Font,
    attributableNode("font"),
    staticString("</font>")
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
  .registerInnerNode(
    NodeTag.Span,
    attributableNode("span"),
    staticString("</span>")
  );

/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { htmlEscape } from "../../utils";
import { FringeLeafRenderFunction, FringeType, LeafNode, NodeTag, SimpleFringeRenderer } from "./DeadDocument";
import { blank, staticString, TransactionalOutputContext } from "./DeadDocumentMarkdown";

export const HTML_RENDERER = new SimpleFringeRenderer<TransactionalOutputContext>();

HTML_RENDERER.registerRenderer<FringeLeafRenderFunction<TransactionalOutputContext>>(
    FringeType.Leaf,
    NodeTag.TextNode,
    function (_tag: NodeTag, node: LeafNode, context: TransactionalOutputContext) {
        context.output.writeString(htmlEscape(node.data));
    }
).registerInnerNode(NodeTag.Emphasis,
    staticString('<em>'),
    staticString('</em>')
).registerInnerNode(NodeTag.HeadingOne,
    staticString('<h1>'),
    staticString('</h1>')
).registerInnerNode(NodeTag.InlineCode,
    staticString('<code>'),
    staticString('</code>')
).registerInnerNode(NodeTag.Paragraph,
    staticString('<p>'),
    staticString('</p>')
).registerInnerNode(NodeTag.PreformattedText,
    staticString('<pre>'),
    staticString('</pre>')
).registerInnerNode(NodeTag.Strong,
    staticString('<strong>'),
    staticString('</strong>')
).registerInnerNode(NodeTag.UnorderedList,
    staticString('<ul>'),
    staticString('</ul>')
).registerInnerNode(NodeTag.OrderedList,
    staticString('<ol>'),
    staticString('</ol>')
).registerInnerNode(NodeTag.ListItem,
    staticString('<li>'),
    staticString('</li>')
).registerInnerNode(NodeTag.LineBreak,
    blank,
    staticString('<br/>'),
).registerInnerNode(NodeTag.BoldFace,
    staticString('<b>'),
    staticString('</b>')
).registerInnerNode(NodeTag.ItalicFace,
    staticString('<i>'),
    staticString('</i>')
).registerInnerNode(NodeTag.Anchor,
    function(_fringe, node, context, _environment) {
        context.output.writeString('<a');
        if (node.attributeMap.size > 0) {
            for (const [key, value] of node.attributeMap.entries()) {
                context.output.writeString(` ${htmlEscape(key)}="${htmlEscape(value)}"`);
            }
        }
        context.output.writeString('>')
    },
    staticString('</a>')
).registerInnerNode(NodeTag.Root,
    blank,
    blank
).registerInnerNode(NodeTag.Details,
    staticString('<details>'),
    staticString('</details>')
).registerInnerNode(NodeTag.Summary,
    staticString('<summary>'),
    staticString('</summary>')
);

/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { FringeLeafRenderFunction, FringeType, LeafNode, NodeTag, SimpleFringeRenderer } from "./DeadDocument";
import { staticString, TransactionalOutputContext } from "./DeadDocumentMarkdown";

export const HTML_RENDERER = new SimpleFringeRenderer<TransactionalOutputContext>();

HTML_RENDERER.registerRenderer<FringeLeafRenderFunction<TransactionalOutputContext>>(
    FringeType.Leaf,
    NodeTag.TextNode,
    function (_tag: NodeTag, node: LeafNode, context: TransactionalOutputContext) {
        context.output.writeString(node.data);
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
);

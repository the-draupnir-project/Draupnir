// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  DocumentNode,
  LeafNode,
  makeDocumentNode,
  makeLeafNode,
  NodeTag,
  TextNode,
} from "./DeadDocument";

type JSXChild = DocumentNode | LeafNode | string | number | JSXChild[];
type NodeProperties = { children?: JSXChild[] | JSXChild };
type LeafNodeProperties = { children?: never[] };

// We need to use a namespace here for the JSXFactory, at least i think.
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace DeadDocumentJSX {
  export function JSXFactory(
    tag: NodeTag,
    properties?: Record<string, string>,
    ...rawChildren: (DocumentNode | LeafNode | string)[]
  ) {
    const node = makeDocumentNode(tag);
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        node.attributeMap.set(key, value);
      }
    }
    const ensureChild = (rawChild: JSXChild) => {
      if (typeof rawChild === "string") {
        makeLeafNode<TextNode>(NodeTag.TextNode, node, rawChild);
      } else if (typeof rawChild === "number") {
        makeLeafNode<TextNode>(NodeTag.TextNode, node, rawChild.toString());
      } else if (Array.isArray(rawChild)) {
        rawChild.forEach(ensureChild);
        // Then it's a DocumentNode|LeafNode
      } else if (typeof rawChild.leafNode === "boolean") {
        if (rawChild.tag === NodeTag.Fragment) {
          (rawChild as DocumentNode)
            .getChildren()
            .forEach(node.addChild.bind(node));
        } else {
          node.addChild(rawChild);
        }
      }
    };
    rawChildren.forEach(ensureChild);
    return node;
  }
  // eslint-disable-next-line @typescript-eslint/no-namespace
  export namespace JSX {
    export interface IntrinsicElements {
      a: NodeProperties & { href?: string; name?: string; target?: string };
      b: NodeProperties;
      br: LeafNodeProperties;
      code: NodeProperties & { class?: string };
      details: NodeProperties;
      em: NodeProperties;
      font: NodeProperties & { color?: string };
      fragment: NodeProperties;
      h1: NodeProperties;
      h2: NodeProperties;
      h3: NodeProperties;
      h4: NodeProperties;
      h5: NodeProperties;
      h6: NodeProperties;
      hr: LeafNodeProperties;
      i: NodeProperties;
      li: NodeProperties;
      ol: NodeProperties & { start?: number };
      p: NodeProperties;
      pre: NodeProperties;
      root: NodeProperties;
      span: NodeProperties & {
        "data-mx-bg-color"?: string;
        "data-mx-color"?: string;
        "data-mx-spoiler"?: string | undefined;
      };
      strong: NodeProperties;
      summary: NodeProperties;
      ul: NodeProperties;
    }
    export type Element = DocumentNode;
    export type ElementChildrenAttribute = {
      children?: JSXChild[] | JSXChild | never[];
    };
  }
}

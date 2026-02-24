// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StandardSuperCoolStream } from "@gnuxie/super-cool-stream";

/**
 * The DeadDocument started as a universal document object model like Pandoc is.
 * That kind of task is just too big for me though and someone else should have
 * done it already. Irregardless, the way this is used is a simple DOM that can
 * be used to incrementally render both HTML and Markdown.
 * The reason we need to incrementally render both HTML and Markdown
 * (which really means serialize, hence `DeadDocument`) is so that
 * we can ensure in Matrix that both renditions of a node (html + markdown)
 * are always in the same event and not split across multiple events.
 * This ensures consistency when someone replies to an event that whichever
 * format the client uses, the reply will be about the same "thing".
 * So we have the power to split messages across multiple Matrix events
 * automatically, without the need for micromanagement.
 *
 * While originally we were going to generate this DOM using a custom
 * internal DSL, we discovered it was possible to use JSX templates with a
 * custom DOM. You can find our own JSXFactory in `./JSXFactory.ts`.
 *
 * This means that end users shouldn't have to touch this DOM directly.
 */

export interface AbstractNode {
  readonly parent: DocumentNode | null;
  readonly leafNode: boolean;
  readonly tag: NodeTag;
}

export interface DocumentNode extends AbstractNode {
  readonly leafNode: false;
  attributeMap: Map<string, string>;
  addChild<Node extends DocumentNode | LeafNode>(node: Node): Node;
  getChildren(): (DocumentNode | LeafNode)[];
  getFirstChild(): DocumentNode | LeafNode | undefined;
}

export interface LeafNode extends AbstractNode {
  readonly parent: DocumentNode;
  readonly data: string;
  readonly leafNode: true;
}

// These are NOT necessarily HTML tags.
export enum NodeTag {
  TextNode = "text",
  InlineCode = "code",
  PreformattedText = "pre",
  Root = "root",
  Strong = "strong",
  Emphasis = "em",
  Paragraph = "p",
  HeadingOne = "h1",
  HeadingTwo = "h2",
  HeadingThree = "h3",
  HeadingFour = "h4",
  HeadingFive = "h5",
  HeadingSix = "h6",
  UnorderedList = "ul",
  OrderedList = "ol",
  ListItem = "li",
  LineBreak = "br",
  BoldFace = "b",
  ItalicFace = "i",
  Anchor = "a",
  Fragment = "fragment",
  Details = "details",
  Summary = "summary",
  Font = "font",
  Span = "span",
  HorizontalRule = "hr",
}

export const EmptyFragment = makeDocumentNode(NodeTag.Fragment);

/**
 * This is an internal interface so we can provide
 * an implementation of `DocumentNode` in a way
 * where we can use ad-hoc mixins.
 */
interface DeadDocumentNode extends DocumentNode {
  children: (DocumentNode | LeafNode)[];
  attributeMap: Map<string, string>;
}

export function addChild<Node extends DocumentNode | LeafNode>(
  this: DeadDocumentNode,
  node: Node
): Node {
  if (this.children.includes(node)) {
    return node;
  }
  this.children.push(node);
  return node;
}

export function getChildren(
  this: DeadDocumentNode
): (DocumentNode | LeafNode)[] {
  return [...this.children];
}

export function getFirstChild(
  this: DeadDocumentNode
): DocumentNode | LeafNode | undefined {
  return this.children.at(0);
}

export function makeDocumentNode(tag: NodeTag, parent = null): DocumentNode {
  const node: DeadDocumentNode = {
    tag,
    leafNode: false,
    parent,
    children: [],
    attributeMap: new Map(),
    addChild,
    getChildren,
    getFirstChild,
  };
  return node;
}

export function makeLeafNode<LeafInterface extends LeafNode>(
  tag: LeafInterface["tag"],
  parent: DocumentNode,
  data: string
): LeafInterface {
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
  return this.addChild(makeLeafNode<TextNode>(NodeTag.TextNode, this, data));
}

export interface InlineCodeNode extends LeafNode {
  readonly tag: NodeTag.InlineCode;
}

export function addInlineCode(
  this: DocumentNode,
  data: string
): InlineCodeNode {
  return this.addChild(
    makeLeafNode<InlineCodeNode>(NodeTag.InlineCode, this, data)
  );
}

export interface PreformattedTextNode extends LeafNode {
  readonly tag: NodeTag.PreformattedText;
}

export function addPreformattedText(
  this: DocumentNode,
  data: string
): PreformattedTextNode {
  return this.addChild(
    makeLeafNode<PreformattedTextNode>(NodeTag.PreformattedText, this, data)
  );
}

/**
 * We use a Fringe to render.
 */

export enum FringeType {
  Pre = "pre",
  Leaf = "leaf",
  Post = "post",
}

type AnnotatedFringeNode = {
  type: FringeType;
  node: DocumentNode | LeafNode;
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
    return node
      .getChildren()
      .reduce((previous: Flat, child: DocumentNode | LeafNode) => {
        return fringe(child, previous);
      }, flat);
  }
}

function fringe(node: DocumentNode | LeafNode, flat: Flat = []): Flat {
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
export type FringeLeafRenderFunction<Context> = (
  tag: NodeTag,
  node: LeafNode,
  context: Context
) => void;
export type FringeInnerRenderFunction<Context> = (
  type: FringeType,
  node: DocumentNode,
  context: Context,
  environment: TagDynamicEnvironment
) => void;

export interface FringeRenderer<Context> {
  getLeafRenderer(tag: NodeTag): FringeLeafRenderFunction<Context>;
  getPreRenderer(tag: NodeTag): FringeInnerRenderFunction<Context>;
  getPostRenderer(tag: NodeTag): FringeInnerRenderFunction<Context>;
}

export class SimpleFringeRenderer<Context> implements FringeRenderer<Context> {
  private readonly preRenderers = new Map<
    NodeTag,
    FringeInnerRenderFunction<Context>
  >();
  private readonly leafRenderers = new Map<
    NodeTag,
    FringeLeafRenderFunction<Context>
  >();
  private readonly postRenderers = new Map<
    NodeTag,
    FringeInnerRenderFunction<Context>
  >();

  private getRenderer<T>(
    table: Map<NodeTag, T>,
    type: FringeType,
    tag: NodeTag
  ): T {
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

  public internRenderer<
    T extends
      | FringeInnerRenderFunction<Context>
      | FringeLeafRenderFunction<Context>,
  >(type: FringeType, tag: NodeTag, table: Map<NodeTag, T>, renderer: T): void {
    if (table.has(tag)) {
      throw new TypeError(
        `There is already a renderer registered for ${type} ${tag}`
      );
    }
    table.set(tag, renderer);
  }

  public registerRenderer<
    T extends
      | FringeInnerRenderFunction<Context>
      | FringeLeafRenderFunction<Context>,
  >(type: FringeType, tag: NodeTag, renderer: T): this {
    // The casting in here is evil. Not sure how to fix it.
    switch (type) {
      case FringeType.Pre:
        this.internRenderer<T>(
          type,
          tag,
          this.preRenderers as Map<NodeTag, T>,
          renderer
        );
        break;
      case FringeType.Leaf:
        this.internRenderer<T>(
          type,
          tag,
          this.leafRenderers as Map<NodeTag, T>,
          renderer
        );
        break;
      case FringeType.Post:
        this.internRenderer<T>(
          type,
          tag,
          this.postRenderers as Map<NodeTag, T>,
          renderer
        );
        break;
    }
    return this;
  }

  public registerInnerNode(
    tag: NodeTag,
    pre: FringeInnerRenderFunction<Context>,
    post: FringeInnerRenderFunction<Context>
  ): this {
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
  NodeTag.UnorderedList,
  NodeTag.Root,
]);

class FringeStream extends StandardSuperCoolStream<AnnotatedFringeNode, Flat> {}

export type CommitHook<Context> = (
  node: DocumentNode,
  context: Context
) => void;

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

  public increment(): DocumentNode | undefined {
    const renderInnerNode = (node: AnnotatedFringeNode) => {
      if (node.node.leafNode) {
        throw new TypeError(
          "Leaf nodes should not be in the Pre/Post position"
        );
      }
      const renderer =
        node.type === FringeType.Pre
          ? this.renderer.getPreRenderer(node.node.tag)
          : this.renderer.getPostRenderer(node.node.tag);
      renderer(node.type, node.node, this.context, this.dynamicEnvironment);
      return node.node;
    };
    const postNode = (node: AnnotatedFringeNode): DocumentNode => {
      if (node.node.leafNode) {
        throw new TypeError(
          "Leaf nodes should not be in the Pre/Post position"
        );
      }
      renderInnerNode(node);
      this.dynamicEnvironment.pop(node.node);
      return node.node;
    };
    const isAnnotatedNodeCommittable = (node: AnnotatedFringeNode): boolean => {
      return (
        COMMITTABLE_NODES.has(node.node.tag) && node.type === FringeType.Post
      );
    };
    while (
      this.stream.peekItem() &&
      !isAnnotatedNodeCommittable(this.stream.peekItem())
    ) {
      const annotatedNode = this.stream.readItem();
      if (annotatedNode === undefined) {
        throw new TypeError(`Stream code is wrong`);
      }
      switch (annotatedNode.type) {
        case FringeType.Pre:
          renderInnerNode(annotatedNode);
          break;
        case FringeType.Post:
          postNode(annotatedNode);
          break;
        case FringeType.Leaf:
          if (!annotatedNode.node.leafNode) {
            throw new TypeError(
              "Leaf nodes should not be marked as an inner node"
            );
          }
          this.renderer.getLeafRenderer(annotatedNode.node.tag)(
            annotatedNode.node.tag,
            annotatedNode.node as unknown as LeafNode,
            this.context
          );
          break;
        default:
          throw new TypeError(`Uknown fringe type ${annotatedNode.type}`);
      }
    }
    if (this.stream.peekItem() === undefined) {
      return undefined;
    }
    const documentNode = postNode(this.stream.readItem());
    this.commitHook(documentNode, this.context);
    return documentNode;
  }
}

export class TagDynamicEnvironmentEntry {
  constructor(
    public readonly node: DocumentNode,
    public value: unknown,
    public readonly previous: undefined | TagDynamicEnvironmentEntry
  ) {}
}

/**
 * A dynamic environment is just an environment of bindings that is made
 * by shadowing previous bindings and pushing and popping bindings "dynamically"
 * for a given variable with some thing.
 *
 * In this example, we push and pop bindings with `DocumentNode`s.
 * For example, if you make a binding to a variable called `indentationLevel`
 * to set it to `1` from a `<ul>` node, then this binding should be popped
 * when the `FringeWalker` reaches the post node (`</ul>`).
 * Howerver, if we encounter another `<ul>`, we can read the existing value
 * for `indentationLevel`, increment it and create a new binding
 * that shadows the existing one. This too will get popped once we encounter
 * the post node for this `<ul>` node (`</ul>`).
 *
 * This makes it very easy to express a situation where you modify and
 * restore variables that depend on node depth when walking the fringe,
 * as the restoration of previous values can be handled automatically for us.
 */
export class TagDynamicEnvironment {
  private readonly environments = new Map<
    string,
    TagDynamicEnvironmentEntry | undefined
  >();

  public read<T = unknown>(variableName: string): T {
    const variableEntry = this.environments.get(variableName);
    if (variableEntry) {
      return variableEntry.value as T;
    } else {
      throw new TypeError(`The variable ${variableName} is unbound.`);
    }
  }

  public write<T = unknown>(variableName: string, value: T): T {
    const variableEntry = this.environments.get(variableName);
    if (variableEntry) {
      return (variableEntry.value = value);
    } else {
      throw new TypeError(`The variable ${variableName} is unbound.`);
    }
  }

  public bind<T = unknown>(
    variableName: string,
    node: DocumentNode,
    value: T
  ): T {
    const entry = this.environments.get(variableName);
    const newEntry = new TagDynamicEnvironmentEntry(node, value, entry);
    this.environments.set(variableName, newEntry);
    return value;
  }

  public pop(node: DocumentNode): void {
    for (const [variableName, environment] of this.environments.entries()) {
      if (Object.is(environment?.node, node)) {
        this.environments.set(variableName, environment?.previous);
      }
    }
  }
}

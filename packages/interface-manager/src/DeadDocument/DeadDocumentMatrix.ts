// Copyright 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import {
  AbstractNode,
  DocumentNode,
  FringeWalker,
  NodeTag,
} from "./DeadDocument";
import { PagedDuplexStream } from "./PagedDuplexStream";
import { HTML_RENDERER } from "./DeadDocumentHTML";
import { MARKDOWN_RENDERER } from "./DeadDocumentMarkdown";

function checkEqual(
  node1: AbstractNode | undefined,
  node2: AbstractNode | undefined
): true {
  if (!Object.is(node1, node2)) {
    throw new TypeError("There is an implementation bug in one of the walker");
  }
  return true;
}

export type SendMatrixEventCB<EventID> = (
  text: string,
  html: string
) => Promise<Result<EventID>>;

/**
 * Render the `DocumentNode` to Matrix (in both HTML + Markdown) using the
 * callback provided to send each event. Should serialized content span
 * more than one event, then the callback will be called for each event.
 * @param node A document node to render to Matrix.
 * @param cb A callback that will send the text+html for a single event
 * to a Matrix room.
 */
export async function renderMatrix<EventID>(
  node: DocumentNode,
  cb: SendMatrixEventCB<EventID>
): Promise<Result<EventID[]>> {
  const commitHook = (
    commitNode: DocumentNode,
    context: { output: PagedDuplexStream }
  ) => {
    context.output.commit(commitNode);
  };
  if (node.tag !== NodeTag.Root) {
    // rendering has to start (and end) with a committable node.
    throw new TypeError(
      "Tried to render a node without a root, this will not be committable"
    );
  }
  const markdownOutput = new PagedDuplexStream();
  const markdownWalker = new FringeWalker(
    node,
    { output: markdownOutput },
    MARKDOWN_RENDERER,
    commitHook
  );
  const htmlOutput = new PagedDuplexStream();
  const htmlWalker = new FringeWalker(
    node,
    { output: htmlOutput },
    HTML_RENDERER,
    commitHook
  );
  const eventIds: EventID[] = [];
  const outputs = [htmlOutput, markdownOutput];
  let currentMarkdownNode = markdownWalker.increment();
  let currentHtmlNode = htmlWalker.increment();
  checkEqual(currentHtmlNode, currentMarkdownNode);
  while (currentHtmlNode !== undefined) {
    if (outputs.some((o) => o.peekPage())) {
      // Make sure that any outputs that have buffered input start a fresh page,
      // so that the same committed nodes end up in the same message.
      outputs
        .filter((o) => !o.peekPage())
        .forEach((o) => {
          o.ensureNewPage();
        });
      // Send the new pages as an event.
      const [nextMakrdownPage, nextHtmlPage] = [
        markdownOutput.readPage(),
        htmlOutput.readPage(),
      ];
      if (nextMakrdownPage === undefined || nextHtmlPage === undefined) {
        throw new TypeError(`The code is wrong!!`);
      }
      const sendResult = await cb(nextMakrdownPage, nextHtmlPage);
      if (isError(sendResult)) {
        return sendResult;
      }
      eventIds.push(sendResult.ok);
    }
    // prepare next iteration
    currentMarkdownNode = markdownWalker.increment();
    currentHtmlNode = htmlWalker.increment();
    checkEqual(currentHtmlNode, currentMarkdownNode);
  }
  outputs.forEach((o) => {
    o.ensureNewPage();
  });
  if (outputs.some((o) => o.peekPage())) {
    const [nextMakrdownPage, nextHtmlPage] = [
      markdownOutput.readPage(),
      htmlOutput.readPage(),
    ];
    if (nextMakrdownPage === undefined || nextHtmlPage === undefined) {
      throw new TypeError(`The code is wrong!!`);
    }
    const sendResult = await cb(nextMakrdownPage, nextHtmlPage);
    if (isError(sendResult)) {
      return sendResult;
    }
    eventIds.push(sendResult.ok);
  }
  return Ok(eventIds);
}

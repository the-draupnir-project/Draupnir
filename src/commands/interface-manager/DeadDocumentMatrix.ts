/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { MatrixSendClient } from "../../MatrixEmitter";
import { AbstractNode, DocumentNode, FringeWalker } from "./DeadDocument";
import { HTML_RENDERER } from "./DeadDocumentHtml";
import { MARKDOWN_RENDERER } from "./DeadDocumentMarkdown";
import { PagedDuplexStream } from "./PagedDuplexStream";

function checkEqual(node1: AbstractNode|undefined, node2: AbstractNode|undefined): true {
    if (!Object.is(node1, node2)) {
        throw new TypeError('There is an implementation bug in one of the walker')
    }
    return true;
}

export type SendMatrixEventCB = (text: string, html: string) => Promise<void>;

/**
 * Render the `DocumentNode` to Matrix (in both HTML + Markdown) using the
 * callback provided to send each event. Should serialized content span
 * more than one event, then the callback will be called for each event.
 * @param node A document node to render to Matrix.
 * @param cb A callback that will send the text+html for a single event
 * to a Matrix room.
 */
export async function renderMatrix(node: DocumentNode, cb: SendMatrixEventCB) {
    const commitHook = (commitNode: DocumentNode, context: { output: PagedDuplexStream }) => {
        context.output.commit(commitNode);
    };
    const markdownOutput = new PagedDuplexStream();
    const markdownWalker = new FringeWalker(
        node,
        { output: markdownOutput },
        MARKDOWN_RENDERER,
        commitHook,
    );
    const htmlOutput = new PagedDuplexStream();
    const htmlWalker = new FringeWalker(
        node,
        { output: htmlOutput },
        HTML_RENDERER,
        commitHook,
    );
    const outputs = [htmlOutput, markdownOutput];
    let currentMarkdownNode = markdownWalker.increment();
    let currentHtmlNode = htmlWalker.increment();
    checkEqual(currentHtmlNode, currentMarkdownNode);
    while (currentHtmlNode !== undefined) {
        if (outputs.some(o => o.peekPage())) {
            // Ensure each stream has the same nodes in the new page.
            // I'm really worried that somehow a stream can have a page waiting
            // while also having buffered output? so when it is ensured, that output is appended?
            // that means there's an implementation issue in the walker's though.
            outputs.forEach(o => o.ensureNewPage());
            // Send the new pages as an event.
            await cb(markdownOutput.readPage()!, htmlOutput.readPage()!);
        }
        // prepare next iteration
        currentMarkdownNode = markdownWalker.increment();
        currentHtmlNode = htmlWalker.increment();
        checkEqual(currentHtmlNode, currentMarkdownNode);
    }
    outputs.forEach(o => o.ensureNewPage());
    if (outputs.some(o => o.peekPage())) {
        await cb(markdownOutput.readPage()!, htmlOutput.readPage()!);
    }
}

/**
 * Render the document node to html+text `m.notice` events.
 * @param node The document node to render.
 * @param roomId The room to send the events to.
 * @param event An event to reply to.
 * @param client A MatrixClient to send the events with.
 */
export async function renderMatrixAndSend(node: DocumentNode, roomId: string, event: any, client: MatrixSendClient): Promise<void> {
    // We desperatley need support for threads to make this work in a non-shit way.
    await renderMatrix(node, async (text: string, html: string) => {
        await client.sendMessage(roomId, {
            msgtype: "m.notice",
            body: text,
            format: "org.matrix.custom.html",
            formatted_body: html,
        });
    });
}
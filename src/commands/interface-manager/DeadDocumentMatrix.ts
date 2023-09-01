/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { MatrixSendClient } from "../../MatrixEmitter";
import { AbstractNode, DocumentNode, FringeWalker, NodeTag } from "./DeadDocument";
import { HTML_RENDERER } from "./DeadDocumentHtml";
import { MARKDOWN_RENDERER } from "./DeadDocumentMarkdown";
import { PagedDuplexStream } from "./PagedDuplexStream";

function checkEqual(node1: AbstractNode|undefined, node2: AbstractNode|undefined): true {
    if (!Object.is(node1, node2)) {
        throw new TypeError('There is an implementation bug in one of the walker')
    }
    return true;
}

export type SendMatrixEventCB = (text: string, html: string) => Promise<string/*event id*/>;

/**
 * Render the `DocumentNode` to Matrix (in both HTML + Markdown) using the
 * callback provided to send each event. Should serialized content span
 * more than one event, then the callback will be called for each event.
 * @param node A document node to render to Matrix.
 * @param cb A callback that will send the text+html for a single event
 * to a Matrix room.
 */
export async function renderMatrix(node: DocumentNode, cb: SendMatrixEventCB): Promise<string[]> {
    const commitHook = (commitNode: DocumentNode, context: { output: PagedDuplexStream }) => {
        context.output.commit(commitNode);
    };
    if (node.tag !== NodeTag.Root) {
        throw new TypeError("Tried to render a node without a root, this will not be committable");
    }
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
    const eventIds: string[] = [];
    const outputs = [htmlOutput, markdownOutput];
    let currentMarkdownNode = markdownWalker.increment();
    let currentHtmlNode = htmlWalker.increment();
    checkEqual(currentHtmlNode, currentMarkdownNode);
    while (currentHtmlNode !== undefined) {
        if (outputs.some(o => o.peekPage())) {
            // Make sure that any outputs that have buffered input start a fresh page,
            // so that the same committed nodes end up in the same message.
            outputs.filter(o => !o.peekPage()).forEach(o => o.ensureNewPage());
            // Send the new pages as an event.
            eventIds.push(await cb(markdownOutput.readPage()!, htmlOutput.readPage()!));
        }
        // prepare next iteration
        currentMarkdownNode = markdownWalker.increment();
        currentHtmlNode = htmlWalker.increment();
        checkEqual(currentHtmlNode, currentMarkdownNode);
    }
    outputs.forEach(o => o.ensureNewPage());
    if (outputs.some(o => o.peekPage())) {
        eventIds.push(await cb(markdownOutput.readPage()!, htmlOutput.readPage()!));
    }
    return eventIds;
}

/**
 * Render the document node to html+text `m.notice` events.
 * @param node The document node to render.
 * @param roomId The room to send the events to.
 * @param event An event to reply to, if any.
 * @param client A MatrixClient to send the events with.
 */
export async function renderMatrixAndSend(node: DocumentNode, roomId: string, event: any|undefined, client: MatrixSendClient, additionalContent = {}): Promise<string[]> {
    const baseContent = (text: string, html: string) => {
        return {
            msgtype: "m.notice",
            body: text,
            format: "org.matrix.custom.html",
            formatted_body: html,
        }
    };
    const renderInitialReply = async (text: string, html: string) => {
        return await client.sendMessage(roomId, {
            ...baseContent(text, html),
            ...additionalContent,
            ...event === undefined
                ? {} // if they don't supply a reply just send a top level event.
                : { "m.relates_to": {
                        "m.in_reply_to": {
                            "event_id": event['event_id']
                        }
                    }
                }
        })
    };
    const renderThreadReply = async (eventId: string, text: string, html: string) => {
        return await client.sendMessage(roomId, {
            ...baseContent(text, html),
            "m.relates_to": {
                "rel_type": "m.thread",
                "event_id": eventId,
            }
        })
    };
    let initialReplyId: string | undefined = undefined;
    return await renderMatrix(node, async (text: string, html: string) => {
        if (initialReplyId === undefined) {
            initialReplyId = await renderInitialReply(text, html);
            return initialReplyId;
        } else {
            return await renderThreadReply(initialReplyId, text, html);
        }
    });
}

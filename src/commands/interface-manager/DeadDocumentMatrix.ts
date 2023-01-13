/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { AbstractNode, DocumentNode, FringeWalker } from "./DeadDocument";
import { HTML_RENDERER } from "./DeadDocumentHtml";
import { MARKDOWN_RENDERER, PagedDuplexStream } from "./DeadDocumentMarkdown";

function checkEqual(node1: AbstractNode|undefined, node2: AbstractNode|undefined): true {
    if (!Object.is(node1, node2)) {
        throw new TypeError('There is an implementation bug in one of the walker')
    }
    return true;
}

export type SendMatrixEventCB = (text: string, html: string) => Promise<void>;

export async function renderMatrix(node: DocumentNode, cb: SendMatrixEventCB) {
    const commitHook = (node: DocumentNode, context: { output: PagedDuplexStream }) => {
        context.output.commit(node);
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
        const outputsWithNewPage = outputs.filter(o => o.peekPage());
        if (outputsWithNewPage.length !== 0) {
            // Ensure each stream has the same nodes in the new page.
            for (const output of outputs) {
                if (!outputsWithNewPage.includes(output)) {
                    output.forceNewPage();
                }
            }
            // Send the new pages as an event.
            await cb(markdownOutput.readPage()!, htmlOutput.readPage()!);
        }
        // prepare next iteration
        currentMarkdownNode = markdownWalker.increment();
        currentHtmlNode = htmlWalker.increment();
        checkEqual(currentHtmlNode, currentMarkdownNode);
    }
}

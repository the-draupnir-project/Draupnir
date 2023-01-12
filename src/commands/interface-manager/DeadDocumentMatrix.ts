/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { AbstractNode, DocumentNode, FringeWalker } from "./DeadDocument";
import { HTML_RENDERER } from "./DeadDocumentHtml";
import { MARKDOWN_RENDERER, TransactionalOutputStream } from "./DeadDocumentMarkdown";

function checkEqual(node1: AbstractNode|undefined, node2: AbstractNode|undefined): true {
    if (!Object.is(node1, node2)) {
        throw new TypeError('There is an implementation bug in one of the walker')
    }
    return true;
}

export function renderMatrix(node: DocumentNode) {
    const markdownOutput = new TransactionalOutputStream();
    const markdownWalker = new FringeWalker(
        node,
        { output: markdownOutput },
        MARKDOWN_RENDERER
    );
    const htmlOutput = new TransactionalOutputStream();
    const htmlWalker = new FringeWalker(
        node,
        { output: htmlOutput },
        HTML_RENDERER
    );
    let currentMarkdownNode = markdownWalker.increment();
    let currentHtmlNode = htmlWalker.increment();
    checkEqual(currentHtmlNode, currentMarkdownNode);
    while (currentHtmlNode) {
        htmlOutput.attemptCommit
    }
    
}
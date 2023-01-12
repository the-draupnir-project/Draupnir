/**
 * Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
 * All rights reserved.
 */

import { AbstractNode, DocumentNode, FringeWalker } from "./DeadDocument";
import { HTML_RENDERER } from "./DeadDocumentHtml";
import { MARKDOWN_RENDERER, PagedOutputStream } from "./DeadDocumentMarkdown";

function checkEqual(node1: AbstractNode|undefined, node2: AbstractNode|undefined): true {
    if (!Object.is(node1, node2)) {
        throw new TypeError('There is an implementation bug in one of the walker')
    }
    return true;
}

export function renderMatrix(node: DocumentNode) {
    const markdownOutput = new PagedOutputStream();
    const markdownWalker = new FringeWalker(
        node,
        { output: markdownOutput },
        MARKDOWN_RENDERER
    );
    const htmlOutput = new PagedOutputStream();
    const htmlWalker = new FringeWalker(
        node,
        { output: htmlOutput },
        HTML_RENDERER
    );
    const outputs = [htmlOutput, markdownOutput];
    // surely this shit should be internal to the transactional output stream
    // and it should be the paged output stream?
    // well we can't make it internal if both of the things are writing to it.
    // what we can do is make 
    // Why the hell are we making the pages AOT??
    // There should only be one page inside the stream
    // and it should have to be consumed before continuing
    // otherwise we just stack up tonnes of garbage.
    // What if we make a class that eats walkers.
    // it creats streams and writes the pa--
    // wait a minute that's what this is ? 
    let currentMarkdownNode = markdownWalker.increment();
    let currentHtmlNode = htmlWalker.increment();
    checkEqual(currentHtmlNode, currentMarkdownNode);
    while (currentHtmlNode !== undefined) {
        if (outputs.some(o => o.isPageAndBufferOverSize())) {
            outputs.forEach(o => o.forceNewPage(currentHtmlNode!));
        }
    }
    
}
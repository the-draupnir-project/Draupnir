// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Result } from "@gnuxie/typescript-result";

export interface PaginationIteratorOptions<ChunkItem> {
  forEachItemCB: (item: ChunkItem) => void;
  totalItemLimit?: number;
}

/**
 * Iterator abstraction that repeatedly calls `nextPage()`
 * until either there are no more results or a totalItemLimit is reached.
 */
export interface PaginationIterator<ChunkItem> {
  forEachItem(
    options: PaginationIteratorOptions<ChunkItem>
  ): Promise<Result<void>>;
}

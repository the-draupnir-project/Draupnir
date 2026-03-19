// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import { MatrixPaginator } from "./MatrixPaginator";
import {
  PaginationIterator,
  PaginationIteratorOptions,
} from "./PaginationIteration";
import { PaginationOptions } from "./PaginationOptions";

export class StandardPaginationIterator<
  ChunkItem,
  TOptions extends PaginationOptions = PaginationOptions,
> implements PaginationIterator<ChunkItem> {
  public constructor(
    private readonly startingOptions: TOptions,
    private readonly paginator: MatrixPaginator<ChunkItem, TOptions>
  ) {
    // nothing to do.
  }

  public async forEachItem(
    options: PaginationIteratorOptions<ChunkItem>
  ): Promise<Result<void>> {
    const isUnderLimit = (count: number) =>
      options.totalItemLimit === undefined || count < options.totalItemLimit;
    let itemCount = 0;
    const startingPage = await this.paginator.fetchPage(this.startingOptions);
    if (isError(startingPage)) {
      return startingPage.elaborate(
        "Failed to fetch first page when paginating"
      );
    }
    let currentPage = startingPage.ok;
    let isFirstPage = true;
    while (true) {
      let isMarkedAsStop = false;
      for (const item of currentPage.chunk) {
        isMarkedAsStop = !isUnderLimit(itemCount);
        if (isMarkedAsStop) {
          break;
        }
        options.forEachItemCB(item);
        itemCount++;
      }
      if (isMarkedAsStop) {
        break;
      }
      if (!currentPage.hasNext && !isFirstPage) {
        break; // no more items.
      }
      const nextPageOptions = {
        ...this.startingOptions,
        from: currentPage.nextToken,
      };
      const nextPageResult = await this.paginator.fetchPage(nextPageOptions);
      if (isError(nextPageResult)) {
        return nextPageResult.elaborate("Failed to fetch next page");
      } else {
        currentPage = nextPageResult.ok;
      }
      isFirstPage = false;
    }
    return Ok(undefined);
  }
}

// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StringPaginationToken } from "./PaginationToken";

export interface PaginationChunk<ChunkItem> {
  readonly chunk: readonly ChunkItem[];
  /** Pagination token for continuing backwards in history. */
  readonly previousToken: StringPaginationToken | undefined;
  /** Pagination token for continuing forwards in history. */
  readonly nextToken: StringPaginationToken | undefined;
  /** Whether the server is indicating that there is another page available */
  readonly hasNext: boolean;
  /** Whether the server is indicating that there is a previous page available */
  readonly hasPrevious: boolean;
}

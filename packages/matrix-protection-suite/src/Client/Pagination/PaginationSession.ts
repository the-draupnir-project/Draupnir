// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Result } from "@gnuxie/typescript-result";
import { PaginationChunk } from "./PaginationChunk";

/**
 * Stateful pagination session that fascilitates iteration.
 */
export interface PaginationSession<ChunkItem> {
  /** Fetch the next page (based on direction set at creation). */
  nextPage(): Promise<Result<PaginationChunk<ChunkItem> | null>>;
}

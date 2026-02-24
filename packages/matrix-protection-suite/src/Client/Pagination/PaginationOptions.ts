// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StringPaginationToken } from "./PaginationToken";

export interface PaginationOptions {
  /** Direction of pagination: forwards or backwards. */
  readonly direction: "forwards" | "backwards";

  /** The Maximum number of items to fetch in the chunk. */
  readonly limit: number;

  readonly from?: StringPaginationToken;
}

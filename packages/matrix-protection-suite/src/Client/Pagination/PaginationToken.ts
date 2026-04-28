// SPDX-FileCopyrightText: 2024 - 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { FormatRegistry, Type } from "@sinclair/typebox";

export type PaignationTokenBrand = {
  readonly StringPaginationToken: unique symbol;
};

export type StringPaginationToken = string & PaignationTokenBrand;

FormatRegistry.Set(
  "StringPaginationToken",
  (thing: unknown) => typeof thing === "string"
);

export const StringPaginationTokenSchema = Type.Unsafe<StringPaginationToken>(
  Type.String({ format: "StringPaginationToken" })
);

export function StringPaginationToken(token: unknown): StringPaginationToken {
  if (typeof token !== "string") {
    throw new TypeError(
      `StringPaginationToken must be a string, got ${typeof token}`
    );
  }
  return token as StringPaginationToken;
}

// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

export function escapeHTML(input: string): string {
  return input.replace(
    /[<&"']/g,
    (c) => "&#" + c.charCodeAt(0).toString() + ";"
  );
}

// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok } from "@gnuxie/typescript-result";
import {
  ProjectionAllocator,
  StandardProjectionAllocator,
} from "./ProjectionAllocator";

test("ProjectionAllocator semantics are implemented by the standard allocator", async () => {
  await ProjectionAllocator.check(async () => {
    return Ok(new StandardProjectionAllocator());
  });
});

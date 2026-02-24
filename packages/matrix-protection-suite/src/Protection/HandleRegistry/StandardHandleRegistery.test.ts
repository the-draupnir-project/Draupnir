// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok } from "@gnuxie/typescript-result";
import { HandleRegistrySemantics } from "./HandleRegistry";
import { StandardHandleRegistryDescription } from "./StandardHandleRegistryDescription";
import { HandleRegistryDescriptionSemantics } from "./HandleRegistryDescription";

it("HandleRegistrySemantics are implemented for the standard instance", async () => {
  await HandleRegistrySemantics.check(async () => {
    return Ok(new StandardHandleRegistryDescription());
  });
});

it("HandleRegistryDescription semantics are implemented on the standard instance", async () => {
  await HandleRegistryDescriptionSemantics.check(async () => {
    return Ok(new StandardHandleRegistryDescription());
  });
});

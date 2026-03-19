// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { AllocatableLifetime } from "../Interface/Lifetime";
import {
  HandleDataSourceType,
  HandleDescription,
} from "./HandleRegistry/HandleDescription";
import { ProtectedRoomsSet } from "./ProtectedRoomsSet";
import { Protection, ProtectionDescription } from "./Protection";
import { AnyProjectionNode } from "../Projection/ProjectionNode";
import { StandardHandleRegistryDescription } from "./HandleRegistry/StandardHandleRegistryDescription";

export const ProtectionIntentProjectionNodeHandle: HandleDescription<
  "handleIntentProjectionNode",
  ProtectedRoomsSet,
  (node: AnyProjectionNode, delta: unknown) => void
> = {
  handleName: "handleIntentProjectionNode",
  dataSourceType: HandleDataSourceType.Plugin,
  establish<TPlugin>(
    _context: ProtectedRoomsSet,
    plugin: TPlugin,
    lifetime: AllocatableLifetime<typeof plugin>
  ): Result<void> {
    // FIXME: TPlugin needs a generic constraint that is associated with the general plugin shape for the context provided.
    const protection = plugin as Protection<
      ProtectionDescription<ProtectedRoomsSet>
    >;
    if (protection.intentProjection === undefined) {
      return ResultError.Result(
        "Protection is expecting an intent projection node handle, but isn't providing an intent projection"
      );
    }
    const listener = (node: AnyProjectionNode, delta: unknown) =>
      protection.handleIntentProjectionNode?.(node, delta);
    return lifetime.allocateResource(
      () => {
        protection.intentProjection?.addNodeListener(listener);
        return Ok(listener);
      },
      () => () => {
        protection.intentProjection?.removeNodeListener(listener);
      }
    ) as Result<void>;
  },
};

export const ProtectionHandleRegistryDescription =
  new StandardHandleRegistryDescription<ProtectedRoomsSet>().registerHandleDescription(
    ProtectionIntentProjectionNodeHandle
  );

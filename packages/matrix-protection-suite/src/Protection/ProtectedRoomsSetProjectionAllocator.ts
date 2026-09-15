// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok } from "@gnuxie/typescript-result";
import {
  DisposableProjection,
  ProjectionAllocator,
  StandardProjectionAllocator,
} from "../Projection/ProjectionAllocator";
import {
  MemberBanIntentProjection,
  StandardMemberBanIntentProjection,
} from "./StandardProtections/MemberBanSynchronisation/MemberBanIntentProjection";
import { MemberBanIntentProjectionDescription } from "./StandardProtections/MemberBanSynchronisation/MemberBanIntentProjectionNode";
import {
  ServerBanIntentProjection,
  StandardServerBanIntentProjection,
} from "./StandardProtections/ServerBanSynchronisation/ServerBanIntentProjection";
import { ServerBanIntentProjectionDescription } from "./StandardProtections/ServerBanSynchronisation/ServerBanIntentProjectionNode";
import type { ProtectedRoomsSet } from "./ProtectedRoomsSet";

/**
 * This is used at the top level of the appservice and Draupnir to provide instances
 * of projections that depend on context from a protected rooms set to construct.
 * The projections are still owned by the protected rooms set that wants them.
 * This is just something that we have to deal with until we port the entire
 * data pipeline over unfortunately.
 */
export function makeProtectedRoomsSetProjectionAllocator(): ProjectionAllocator<ProtectedRoomsSet> {
  return new StandardProjectionAllocator<ProtectedRoomsSet>()
    .registerProjection<DisposableProjection<MemberBanIntentProjection>>(
      MemberBanIntentProjectionDescription,
      (context) => {
        return Ok(
          new StandardMemberBanIntentProjection(
            context.setPoliciesMatchingMembership
          )
        );
      }
    )
    .registerProjection<DisposableProjection<ServerBanIntentProjection>>(
      ServerBanIntentProjectionDescription,
      (context) => {
        return Ok(
          new StandardServerBanIntentProjection(
            context.watchedPolicyRooms.revisionIssuer
          )
        );
      }
    );
}

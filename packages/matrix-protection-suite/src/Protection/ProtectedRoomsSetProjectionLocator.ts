// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { Ok } from "@gnuxie/typescript-result";
import {
  DisposableProjection,
  ProjectionLocator,
  StandardProjectionLocator,
} from "../Projection/ProjectionLocator";
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

export function makeProtectedRoomsSetProjectionLocator(
  protectedRoomsSet: ProtectedRoomsSet
): ProjectionLocator<ProtectedRoomsSet> {
  return new StandardProjectionLocator<ProtectedRoomsSet>(protectedRoomsSet)
    .registerProjection<DisposableProjection<MemberBanIntentProjection>>({
      projectionDescription: MemberBanIntentProjectionDescription,
      factory(context) {
        return Ok(
          new StandardMemberBanIntentProjection(
            context.setPoliciesMatchingMembership
          )
        );
      },
    })
    .registerProjection<DisposableProjection<ServerBanIntentProjection>>({
      projectionDescription: ServerBanIntentProjectionDescription,
      factory(context) {
        return Ok(
          new StandardServerBanIntentProjection(
            context.watchedPolicyRooms.revisionIssuer
          )
        );
      },
    });
}

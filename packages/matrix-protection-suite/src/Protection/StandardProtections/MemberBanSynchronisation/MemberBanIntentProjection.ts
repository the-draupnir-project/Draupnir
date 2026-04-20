// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { monotonicFactory } from "ulidx";
import {
  SetMembershipPolicyRevisionIssuer,
  SetMembershipPolicyRevisionListener,
} from "../../../MembershipPolicies/SetMembershipPolicyRevisionIssuer";
import {
  Projection,
  ProjectionOutputHelper,
} from "../../../Projection/Projection";
import {
  MemberBanInputProjectionNode,
  MemberBanIntentProjectionNode,
  StandardMemberBanIntentProjectionNode,
} from "./MemberBanIntentProjectionNode";

export type MemberBanIntentProjection =
  Projection<MemberBanIntentProjectionNode>;

export class StandardMemberBanIntentProjection
  extends ProjectionOutputHelper<MemberBanIntentProjectionNode>
  implements MemberBanIntentProjection
{
  public constructor(
    private readonly membershipPolicyRevisionIssuer: SetMembershipPolicyRevisionIssuer
  ) {
    const node =
      StandardMemberBanIntentProjectionNode.create(monotonicFactory());
    const reduction = node.reduceInitialInputs([
      membershipPolicyRevisionIssuer.currentRevision as unknown as MemberBanInputProjectionNode,
    ]);
    super(reduction.nextNode);
    this.membershipPolicyRevisionIssuer.on(
      "revision",
      this.handleUpstreamRevision
    );
  }

  private handleUpstreamRevision = ((_revision, delta) => {
    this.applyInput(delta);
  }) satisfies SetMembershipPolicyRevisionListener;

  [Symbol.dispose]() {
    this.membershipPolicyRevisionIssuer.off(
      "revision",
      this.handleUpstreamRevision
    );
    super[Symbol.dispose]();
  }
}

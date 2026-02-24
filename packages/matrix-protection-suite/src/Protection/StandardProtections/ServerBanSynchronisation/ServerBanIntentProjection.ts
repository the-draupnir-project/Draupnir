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
  PolicyListRevisionIssuer,
  RevisionListener,
} from "../../../PolicyList/PolicyListRevisionIssuer";
import {
  Projection,
  ProjectionOutputHelper,
} from "../../../Projection/Projection";
import {
  ServerBanIntentProjectionNode,
  StandardServerBanIntentProjectionNode,
} from "./ServerBanIntentProjectionNode";
import { PolicyListBridgeProjectionNode } from "./PolicyListBridgeProjection";

export type ServerBanIntentProjection =
  Projection<ServerBanIntentProjectionNode>;

export class StandardServerBanIntentProjection
  extends ProjectionOutputHelper<ServerBanIntentProjectionNode>
  implements ServerBanIntentProjection
{
  public constructor(
    private readonly policyListRevisionIssuer: PolicyListRevisionIssuer
  ) {
    const node =
      StandardServerBanIntentProjectionNode.create(monotonicFactory());
    const delta = node.reduceInitialInputs([
      policyListRevisionIssuer.currentRevision as unknown as PolicyListBridgeProjectionNode,
    ]);
    super(node.reduceDelta(delta));
    this.policyListRevisionIssuer.on("revision", this.handleUpstreamRevision);
  }

  private handleUpstreamRevision = ((_revision, delta) => {
    this.applyInput(delta);
  }) satisfies RevisionListener;

  [Symbol.dispose]() {
    this.policyListRevisionIssuer.off("revision", this.handleUpstreamRevision);
    super[Symbol.dispose]();
  }
}

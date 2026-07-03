// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { PolicyListRevision } from "../../../PolicyList/PolicyListRevision";
import { PolicyRuleChange } from "../../../PolicyList/PolicyRuleChange";
import { ProjectionDescription } from "../../../Projection/ProjectionDescription";
import { ProjectionNode } from "../../../Projection/ProjectionNode";

export type PolicyListBridgeProjectionDescription = ProjectionDescription<
  [],
  PolicyRuleChange[],
  PolicyListRevision
>;

export type PolicyListBridgeProjectionNode =
  ProjectionNode<PolicyListBridgeProjectionDescription>;

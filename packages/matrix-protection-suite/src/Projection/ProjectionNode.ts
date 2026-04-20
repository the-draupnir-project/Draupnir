// SPDX-FileCopyrightText: 2025 - 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { ULID } from "ulidx";

export type ExtractDeltaShape<TProjectionNode extends ProjectionNode> =
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TProjectionNode extends ProjectionNode<infer _, infer TDeltaShape>
    ? TDeltaShape
    : never;

export type ExtractInputDeltaShapes<
  TInputs extends ProjectionNode[] | unknown[],
> = TInputs extends ProjectionNode[]
  ? ExtractDeltaShape<TInputs[number]>
  : unknown;

export type ExtractInputProjectionNodes<
  TProjectionNode extends ProjectionNode,
> = TProjectionNode extends ProjectionNode<infer TInputs> ? TInputs : never;

export type ProjectionReduction<
  TNextProjectionNode extends ProjectionNode = ProjectionNode,
  TDownstreamDeltaShape = ExtractDeltaShape<TNextProjectionNode>,
> = {
  readonly nextNode: TNextProjectionNode;
  readonly downstreamDelta: TDownstreamDeltaShape;
};

export type ProjectionNode<
  TInputs extends ProjectionNode[] | unknown[] = unknown[],
  TDownstreamDeltaShape = unknown,
  TAccessMixin = Record<never, never>,
> = {
  readonly ulid: ULID;
  // Whether the projection has no state at all.
  isEmpty(): boolean;
  /**
   * Produces the externally visible delta with the difference between two
   * nodes. This delta is for downstream projections to consume, not the
   * projection itself. To replay and reproduce the projection node
   * from deltas you have to use the input deltas.
   */
  diff(
    nextNode: ProjectionNode<TInputs, TDownstreamDeltaShape, TAccessMixin>
  ): TDownstreamDeltaShape;
  /**
   * Reduces an input delta into the next projection node and the externally
   * visible delta that should be propagated to downstream projections.
   *
   * The downstream delta should describe the public effect of moving from this
   * node to `nextNode`.
   */
  reduceInput(
    input: ExtractInputDeltaShapes<TInputs>
  ): ProjectionReduction<
    ProjectionNode<TInputs, TDownstreamDeltaShape, TAccessMixin>,
    TDownstreamDeltaShape
  >;
  /**
   * Produces the initial node and downstream delta from the current input
   * projection nodes. This can only be used when the node is empty. Otherwise
   * use reduceRebuild.
   */
  reduceInitialInputs(
    input: TInputs
  ): ProjectionReduction<
    ProjectionNode<TInputs, TDownstreamDeltaShape, TAccessMixin>,
    TDownstreamDeltaShape
  >;
  /**
   * Reconciles this node against the current input projection nodes. This is
   * intended for persistence/rebuild flows and for producing corrective
   * downstream deltas after reducer bugs are fixed.
   *
   * Implementations should compute the corrected node from `inputs`, then
   * produce the downstream delta by diffing this node against that corrected
   * node.
   */
  reduceRebuild?(
    inputs: TInputs
  ): ProjectionReduction<
    ProjectionNode<TInputs, TDownstreamDeltaShape, TAccessMixin>,
    TDownstreamDeltaShape
  >;
} & TAccessMixin;

export type AnyProjectionNode = ProjectionNode<never>;

export type ExtractProjectionInputs<
  TProjectionNode extends AnyProjectionNode = AnyProjectionNode,
> =
  TProjectionNode extends ProjectionNode<infer TInputs>
    ? ExtractInputDeltaShapes<TInputs>
    : never;

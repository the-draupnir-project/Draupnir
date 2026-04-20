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

export type ProjectionNodeDelta<
  TDownstreamDeltaShape = unknown,
  TNodeStateDeltaShape = unknown,
> = {
  /**
   * The externally visible delta produced by this node. This is the only
   * delta that should be propagated to downstream projection inputs and
   * projection listeners.
   */
  readonly downstreamDelta: TDownstreamDeltaShape;
  /**
   * The authoritative state transition for this node. This delta must contain
   * all information needed by `reduceDelta` to update the node's internal
   * state, even when the externally visible downstream delta is empty.
   */
  readonly nodeStateDelta: TNodeStateDeltaShape;
};

export type ProjectionNode<
  TInputs extends ProjectionNode[] | unknown[] = unknown[],
  TDownstreamDeltaShape = unknown,
  TNodeStateDeltaShape = unknown,
  TAccessMixin = Record<never, never>,
> = {
  readonly ulid: ULID;
  // Whether the projection has no state at all.
  isEmpty(): boolean;
  /**
   * Reduces an input delta into a full projection-node delta.
   *
   * The downstream delta is the published effect for downstream projections.
   * The node-state delta is the complete internal state transition for this
   * node. These must be derived from the same input and previous node state so
   * that persisted nodes can be rebuilt by replaying or recomputing node-state
   * deltas while still producing corrective downstream deltas.
   */
  reduceInput(
    input: ExtractInputDeltaShapes<TInputs>
  ): ProjectionNodeDelta<TDownstreamDeltaShape, TNodeStateDeltaShape>;
  /**
   * Applies a full projection-node delta to produce the next node.
   *
   * Implementations must update internal state from `nodeStateDelta`, not from
   * `downstreamDelta`. The downstream delta can omit internal transitions that
   * do not cross a downstream-visible boundary, so using it as the source of
   * truth can make the node inconsistent with its persisted/rebuilt state.
   */
  reduceDelta(
    projectionNodeDelta: ProjectionNodeDelta<
      TDownstreamDeltaShape,
      TNodeStateDeltaShape
    >
  ): ProjectionNode<
    TInputs,
    TDownstreamDeltaShape,
    TNodeStateDeltaShape,
    TAccessMixin
  >;
  /**
   * Produces the initial delta, can only be used when the revision is empty.
   * Otherwise you must use reduceRebuild.
   */
  reduceInitialInputs(
    input: TInputs
  ): ProjectionNodeDelta<TDownstreamDeltaShape, TNodeStateDeltaShape>;
  // only needed for persistent storage
  reduceRebuild?(
    inputs: TInputs
  ): ProjectionNodeDelta<TDownstreamDeltaShape, TNodeStateDeltaShape>;
} & TAccessMixin;

export type AnyProjectionNode = ProjectionNode<never>;

export type ExtractProjectionInputs<
  TProjectionNode extends AnyProjectionNode = AnyProjectionNode,
> =
  TProjectionNode extends ProjectionNode<infer TInputs>
    ? ExtractInputDeltaShapes<TInputs>
    : never;

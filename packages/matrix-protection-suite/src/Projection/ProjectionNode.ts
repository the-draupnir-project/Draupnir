// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
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

export type ProjectionNode<
  TInputs extends ProjectionNode[] | unknown[] = unknown[],
  TDeltaShape = unknown,
  TAccessMixin = Record<never, never>,
> = {
  readonly ulid: ULID;
  // Whether the projection has no state at all.
  isEmpty(): boolean;
  reduceInput(input: ExtractInputDeltaShapes<TInputs>): TDeltaShape;
  reduceDelta(
    input: TDeltaShape
  ): ProjectionNode<TInputs, TDeltaShape, TAccessMixin>;
  /**
   * Produces the initial delta, can only be used when the revision is empty.
   * Otherwise you must use reduceRebuild.
   */
  reduceInitialInputs(input: TInputs): TDeltaShape;
  // only needed for persistent storage
  reduceRebuild?(inputs: TInputs): TDeltaShape;
} & TAccessMixin;

export type AnyProjectionNode = ProjectionNode<never>;

export type ExtractProjectionInputs<
  TProjectionNode extends AnyProjectionNode = AnyProjectionNode,
> =
  TProjectionNode extends ProjectionNode<infer TInputs>
    ? ExtractInputDeltaShapes<TInputs>
    : never;

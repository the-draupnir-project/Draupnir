// SPDX-FileCopyrightText: 2025 - 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { ULID } from "ulidx";
import type {
  AnyProjectionDescription,
  ExtractProjectionDescriptionAccessMixin,
  ExtractProjectionDescriptionDeltaShape,
  ExtractProjectionDescriptionInputs,
} from "./ProjectionDescription";

export type ExtractDeltaShape<TProjectionNode extends ProjectionNode> =
  TProjectionNode extends ProjectionNode<infer TDescription>
    ? ExtractProjectionDescriptionDeltaShape<TDescription>
    : never;

export type ExtractInputDeltaShapes<TInputs extends readonly unknown[]> =
  TInputs extends readonly ProjectionNode[]
    ? ExtractDeltaShape<TInputs[number]>
    : unknown;

export type ExtractInputProjectionNodes<
  TProjectionNode extends ProjectionNode,
> =
  TProjectionNode extends ProjectionNode<infer TDescription>
    ? ExtractProjectionDescriptionInputs<TDescription>
    : never;

export type ProjectionNode<
  TDescription extends AnyProjectionDescription = AnyProjectionDescription,
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
    nextNode: ProjectionNode<TDescription>
  ): ExtractProjectionDescriptionDeltaShape<TDescription>;
  /**
   * Reduces an input delta into the next projection node.
   */
  reduceInput(
    input: ExtractInputDeltaShapes<
      ExtractProjectionDescriptionInputs<TDescription>
    >
  ): ProjectionNode<TDescription>;
  /**
   * Produces the initial node from the current input projection nodes. This can
   * only be used when the node is empty. Otherwise use reduceRebuild.
   */
  reduceInitialInputs(
    input: ExtractProjectionDescriptionInputs<TDescription>
  ): ProjectionNode<TDescription>;
  /**
   * Reconciles this node against the current input projection nodes. This is
   * intended for persistence/rebuild flows after reducer bugs are fixed.
   *
   * The projection or orchestration layer is responsible for publishing the
   * corrective downstream delta by diffing this node against the corrected node.
   */
  reduceRebuild?(
    inputs: ExtractProjectionDescriptionInputs<TDescription>
  ): ProjectionNode<TDescription>;
} & ExtractProjectionDescriptionAccessMixin<TDescription>;

export type AnyProjectionNode = ProjectionNode;

export type ExtractProjectionInputs<
  TProjectionNode extends AnyProjectionNode = AnyProjectionNode,
> =
  TProjectionNode extends ProjectionNode<infer TDescription>
    ? ExtractInputDeltaShapes<ExtractProjectionDescriptionInputs<TDescription>>
    : never;

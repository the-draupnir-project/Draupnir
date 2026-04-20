// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from matrix-protection-suite
// https://github.com/Gnuxie/matrix-protection-suite
// </text>

import { EventEmitter } from "stream";
import {
  AnyProjectionNode,
  ExtractDeltaShape,
  ExtractInputDeltaShapes,
  ExtractInputProjectionNodes,
  ExtractProjectionInputs,
  ProjectionNode,
} from "./ProjectionNode";

export type ProjectionNodeListener<
  TProjectionNode extends ProjectionNode = ProjectionNode,
> = (
  currentNode: TProjectionNode,
  delta: ExtractDeltaShape<TProjectionNode>,
  previousNode: TProjectionNode
) => void;

export interface Projection<
  TProjectionNode extends AnyProjectionNode = AnyProjectionNode,
> {
  readonly currentNode: TProjectionNode;
  addOutput(projection: Projection): this;
  removeOutput(projection: Projection): this;
  applyInput(input: ExtractProjectionInputs<TProjectionNode>): void;
  addNodeListener(listener: ProjectionNodeListener<TProjectionNode>): this;
  removeNodeListener(listener: ProjectionNodeListener<TProjectionNode>): this;
}

export type ExtractProjectionNode<TProjection> =
  TProjection extends Projection<infer TProjectionNode>
    ? TProjectionNode
    : never;

// Technically an orchestration engine needs to do the job of running reducers
// and applying input. Because in order for input to make sense, all of the dependencies
// need to process updates first before we do.
// I'd like to avoid orchestrating via a central engine and instead propagate ULIDs
// recognised revisions for each input. This information needs to live on projections
// for each input projection. And it can be accessed by downstream projections
// and also each downstream projection with a common dependency will want to
// be informed of when so they can do this dance themselves.
// idk progress markers can cause storms, it only matters when there is a
// fork in the tree and a convergence. It can probably be detected and handled
// automatically by PRR. hmm i don't know about that. Are we sure there isn't
// something unsafe about forks in the first place? there is.
// Dependencies like this can only be viewed through other projections.
export class ProjectionOutputHelper<
  TProjectionNode extends ProjectionNode = ProjectionNode,
> {
  private readonly outputs = new Set<Projection<ProjectionNode>>();
  private readonly emitter = new EventEmitter();
  public constructor(public currentNode: TProjectionNode) {
    // nothing to do.
  }

  applyInput(
    input: ExtractInputDeltaShapes<ExtractInputProjectionNodes<TProjectionNode>>
  ): void {
    const previousNode = this.currentNode;
    this.currentNode = previousNode.reduceInput(input) as TProjectionNode;
    const downstreamDelta = previousNode.diff(this.currentNode);
    for (const output of this.outputs) {
      output.applyInput(downstreamDelta);
    }
    this.emitter.emit(
      "projection",
      this.currentNode,
      downstreamDelta,
      previousNode
    );
  }

  addOutput(projection: Projection): this {
    this.outputs.add(projection);
    return this;
  }

  removeOutput(projection: Projection): this {
    this.outputs.delete(projection);
    return this;
  }

  addNodeListener(listener: ProjectionNodeListener<TProjectionNode>): this {
    this.emitter.addListener("projection", listener);
    return this;
  }
  removeNodeListener(listener: ProjectionNodeListener<TProjectionNode>): this {
    this.emitter.removeListener("projection", listener);
    return this;
  }

  [Symbol.dispose](): void {
    this.emitter.removeAllListeners();
    this.outputs.clear();
  }
}

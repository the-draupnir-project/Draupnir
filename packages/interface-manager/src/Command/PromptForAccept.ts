// Copyright 2023 - 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Presentation } from "./Presentation";
import { StandardPresentationArgumentStream } from "./PresentationStream";

// we need a `present(PresentationType, Object)` method on something so that it is easy to create
// presentations.
export interface PromptOptions<ObjectType = unknown> {
  readonly suggestions: Presentation<ObjectType>[];
  readonly default?: Presentation<ObjectType>;
}

export interface RestPromptOptions<ObjectType = unknown> {
  readonly suggestions: Presentation<ObjectType>[][];
  readonly default?: Presentation<ObjectType>[];
}

/**
 * The idea is that the InterfaceAcceptor can use the presentation type
 * to derive the prompt, or use the prompt given by the ParameterDescription.
 */
export interface InterfaceAcceptor {
  readonly isPromptable: boolean;
}

export class PromptableArgumentStream extends StandardPresentationArgumentStream {
  constructor(
    source: Presentation[],
    private readonly interfaceAcceptor: InterfaceAcceptor,
    start = 0
  ) {
    super([...source], start);
  }
  public rest() {
    return this.source.slice(this.position);
  }

  public isPromptable(): boolean {
    return this.interfaceAcceptor.isPromptable;
  }
}

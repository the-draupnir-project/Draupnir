// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import {
  StandardSuperCoolStream,
  SuperCoolStream,
} from "@gnuxie/super-cool-stream";
import { Presentation } from "./Presentation";

export interface PresentationArgumentStream extends SuperCoolStream<
  Presentation,
  Presentation[]
> {
  rest(): Presentation[];
  // All of the read items before the current position.
  priorItems(): Presentation[];
}

export class StandardPresentationArgumentStream
  extends StandardSuperCoolStream<Presentation, Presentation[]>
  implements PresentationArgumentStream
{
  public rest() {
    return this.source.slice(this.position);
  }

  public priorItems(): Presentation[] {
    return this.source.slice(0, this.position);
  }
}

// we probably need a command instance builder for when we are parsing arguments
// and then the builder method has a method to `create` the command instance once
// finished.

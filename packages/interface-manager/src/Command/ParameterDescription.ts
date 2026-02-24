// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from @the-draupnir-project/interface-manager
// https://github.com/the-draupnir-project/interface-manager
// </text>

import { Result } from "@gnuxie/typescript-result";
import { PresentationSchema } from "./PresentationSchema";
import { PromptOptions } from "./PromptForAccept";

export type Prompt<ObjectType> = <Context extends never = never>(
  context: Context
) => Promise<Result<PromptOptions<ObjectType>>>;

export interface ParameterDescription<ObjectType = unknown> {
  name: string;
  description?: string | undefined;
  acceptor: PresentationSchema<ObjectType>;
  /**
   * Prompt the interface for an argument that was not provided.
   * @param this Expected to be the executor context that is used to provided to the command executor.
   * @param description The parameter description being accepted.
   * @returns PromptOptions, to be handled by the interface adaptor.
   */
  prompt?: Prompt<ObjectType> | undefined;
}

// Copyright 2024 Haydn Paterson (sinclair) <haydn.developer@gmail.com>
//
// SPDX-License-Identifier: MIT

import { Evaluate, StaticDecode, TSchema } from "@sinclair/typebox";

// Specialized Static - Evaluates Intersections as Object type
// See https://github.com/sinclairzx81/typebox/issues/825#issuecomment-2067795724.
export type EDStatic<T extends TSchema> = Evaluate<StaticDecode<T>>;

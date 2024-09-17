// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ResultError } from "@gnuxie/typescript-result";

export enum SafeModeReason {
  InitializationError = "InitializationError",
  ByRequest = "ByRequest",
}

export type SafeModeCause =
  | { reason: SafeModeReason.ByRequest }
  | { reason: SafeModeReason.InitializationError; error: ResultError };

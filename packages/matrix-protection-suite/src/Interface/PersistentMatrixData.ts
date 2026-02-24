// Copyright (C) 2023 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { StaticDecode, TSchema } from "@sinclair/typebox";
import { ActionResult } from "./Action";

export interface PersistentMatrixData<T extends TSchema> {
  requestPersistentData(): Promise<ActionResult<StaticDecode<T>>>;
  storePersistentData(data: StaticDecode<T>): Promise<ActionResult<void>>;
}

export interface MatrixAccountData<T> {
  requestAccountData(): Promise<ActionResult<T | undefined>>;
  storeAccountData(data: T): Promise<ActionResult<void>>;
}

export interface MatrixStateData<T> {
  requestStateContent(state_key: string): T | undefined;
  storeStateContent(state_key: string, content: T): Promise<ActionResult<void>>;
}

// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { MatrixAccountData } from "./PersistentMatrixData";
import { ActionResult, Ok } from "./Action";
import { PersistentConfigBackend } from "../Config/PersistentConfigData";

export class FakeMatrixAccountData<T> implements MatrixAccountData<T> {
  private fakePersistedData: T;
  constructor(initialData: T) {
    this.fakePersistedData = initialData;
  }
  requestAccountData(): Promise<ActionResult<T | undefined>> {
    return Promise.resolve(Ok(this.fakePersistedData));
  }
  storeAccountData(data: T): Promise<ActionResult<void>> {
    this.fakePersistedData = data;
    return Promise.resolve(Ok(undefined));
  }
}

export class FakePersistentConfigBackend<
  T extends Record<string, unknown>,
> implements PersistentConfigBackend<T> {
  private fakePersistedData: T;
  constructor(initialData: T) {
    this.fakePersistedData = initialData;
  }
  saveEncodedConfig(
    data: Record<string, unknown>
  ): Promise<ActionResult<void>> {
    this.fakePersistedData = data as T;
    return Promise.resolve(Ok(undefined));
  }
  requestUnparsedConfig(): Promise<
    ActionResult<Record<string, unknown> | undefined>
  > {
    return Promise.resolve(Ok(this.fakePersistedData));
  }
}

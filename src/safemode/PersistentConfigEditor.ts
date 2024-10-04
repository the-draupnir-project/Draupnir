// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import { TObject } from "@sinclair/typebox";
import {
  ConfigDescription,
  ConfigParseError,
  MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
  MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
  MjolnirEnabledProtectionsDescription,
  MjolnirEnabledProtectionsEventType,
  MjolnirPolicyRoomsDescription,
  MjolnirProtectedRoomsDescription,
  PersistentConfigData,
  StandardPersistentConfigData,
} from "matrix-protection-suite";
import {
  BotSDKAccountDataConfigBackend,
  MatrixSendClient,
} from "matrix-protection-suite-for-matrix-bot-sdk";

export type PersistentConfigStatus = {
  readonly description: ConfigDescription;
  readonly data: unknown;
  readonly error: ConfigParseError | undefined;
};

export interface PersistentConfigEditor {
  getConfigAdaptors(): PersistentConfigData[];
  requestConfigStatus(): Promise<Result<PersistentConfigStatus[]>>;
}

export class StandardPersistentConfigEditor implements PersistentConfigEditor {
  private readonly configAdaptors: PersistentConfigData[] = [];
  public constructor(client: MatrixSendClient) {
    // We do some sweepy sweepy casting here because the ConfigMirror has methods
    // that accept a specific shape, and obviously that means the type parameter
    // becomes contravariant. I think the only way to fix this is to make the mirrors
    // only work with the general shape rather than the specific one, in the way that
    // the `remove` methods do, but I'm not convinced that works either, as those
    // methods accept a Record that at least has the keys from the specific shape
    // of the config.
    this.configAdaptors = [
      new StandardPersistentConfigData(
        MjolnirPolicyRoomsDescription as unknown as ConfigDescription<TObject>,
        new BotSDKAccountDataConfigBackend(
          client,
          MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE
        )
      ),
      new StandardPersistentConfigData(
        MjolnirProtectedRoomsDescription as unknown as ConfigDescription<TObject>,
        new BotSDKAccountDataConfigBackend(
          client,
          MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE
        )
      ),
      new StandardPersistentConfigData(
        MjolnirEnabledProtectionsDescription as unknown as ConfigDescription<TObject>,
        new BotSDKAccountDataConfigBackend(
          client,
          MjolnirEnabledProtectionsEventType
        )
      ),
    ];
  }
  getConfigAdaptors(): PersistentConfigData[] {
    return this.configAdaptors;
  }

  public async requestConfigStatus(): Promise<
    Result<PersistentConfigStatus[]>
  > {
    const info: PersistentConfigStatus[] = [];
    for (const adaptor of this.configAdaptors) {
      const dataResult = await adaptor.requestConfig();
      if (isError(dataResult)) {
        if (dataResult.error instanceof ConfigParseError) {
          info.push({
            description: adaptor.description,
            data: dataResult.error.config,
            error: dataResult.error,
          });
        } else {
          return dataResult;
        }
      } else {
        info.push({
          description: adaptor.description,
          data: dataResult.ok,
          error: undefined,
        });
      }
    }
    return Ok(info);
  }
}

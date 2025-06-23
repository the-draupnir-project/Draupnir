// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result, isError } from "@gnuxie/typescript-result";
import {
  ConfigDescription,
  ConfigParseError,
  ConfigPropertyUseError,
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
import { SafeModeCause, SafeModeReason } from "./SafeModeCause";

export type PersistentConfigStatus = {
  description: ConfigDescription;
  data: unknown;
  error: ConfigParseError | undefined;
};

export interface PersistentConfigEditor {
  getConfigAdaptors(): PersistentConfigData[];
  requestConfigStatus(): Promise<Result<PersistentConfigStatus[]>>;
  /**
   * requestConfigStatus, but be sure to update the PeristentConfigStatus list
   * with the ConfigPropertyUseError in the safe mode cause, if there is one.
   *
   * This is because `ConfigPropertyUseError`'s will not show up in parsing,
   * only when creating Draupnir itself, and so they won't show up from just requesting
   * the config alone.
   */
  supplementStatusWithSafeModeCause(
    cause: SafeModeCause
  ): Promise<Result<PersistentConfigStatus[]>>;
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
    // of the config. OK that's not why, because I tried to remove the toMirror method.
    // I don't understand why it won't work then...
    this.configAdaptors = [
      new StandardPersistentConfigData(
        MjolnirPolicyRoomsDescription as unknown as ConfigDescription,
        new BotSDKAccountDataConfigBackend(
          client,
          MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE
        )
      ),
      new StandardPersistentConfigData(
        MjolnirProtectedRoomsDescription as unknown as ConfigDescription,
        new BotSDKAccountDataConfigBackend(
          client,
          MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE
        )
      ),
      new StandardPersistentConfigData(
        MjolnirEnabledProtectionsDescription as unknown as ConfigDescription,
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
      const dataResult = await adaptor.requestParsedConfig();
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
  public async supplementStatusWithSafeModeCause(
    cause: SafeModeCause
  ): Promise<Result<PersistentConfigStatus[]>> {
    const info = await this.requestConfigStatus();
    if (isError(info)) {
      return info;
    }
    if (cause.reason === SafeModeReason.ByRequest) {
      return Ok(info.ok);
    }
    if (!(cause.error instanceof ConfigPropertyUseError)) {
      return Ok(info.ok);
    }
    const relevantStatus = info.ok.find(
      (status) =>
        status.description ===
        (cause.error as ConfigPropertyUseError).configDescription
    );
    if (relevantStatus === undefined) {
      throw new TypeError(
        "The cause of the safe mode error was not found in the configuration status."
      );
    }
    relevantStatus.error = new ConfigParseError(
      "There was a problem when using a property in the configuration.",
      relevantStatus.description as unknown as ConfigDescription,
      [cause.error],
      relevantStatus.data
    );
    return Ok(info.ok);
  }
}

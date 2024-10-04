// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { TObject } from "@sinclair/typebox";
import {
  ConfigDescription,
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

export interface PersistentConfigEditor {
  getConfigAdaptors(): PersistentConfigData[];
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
}

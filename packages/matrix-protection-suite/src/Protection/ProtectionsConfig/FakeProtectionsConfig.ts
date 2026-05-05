// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { StandardPersistentConfigData } from "../../Config/PersistentConfigData";
import { FakePersistentConfigBackend } from "../../Interface/FakePersistentMatrixData";
import { StandardLoggableConfigTracker } from "../../Interface/LoggableConfig";
import { MjolnirEnabledProtectionsDescription } from "../ProtectionsConfig/MjolnirEnabledProtectionsDescription";
import { MjolnirProtectionsConfig } from "../ProtectionsConfig/StandardProtectionsConfig";

export class FakeProtectionsConfig extends MjolnirProtectionsConfig {
  public constructor() {
    super(
      new StandardPersistentConfigData(
        MjolnirEnabledProtectionsDescription,
        new FakePersistentConfigBackend({})
      ),
      new StandardLoggableConfigTracker(),
      {
        knownEnabledProtections: [],
        unknownEnabledProtections: [],
      }
    );
  }
}

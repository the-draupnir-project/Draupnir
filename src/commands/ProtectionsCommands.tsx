// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionError,
  ActionResult,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  ProtectionSetting,
  ProtectionSettings,
  ProtectionsManager,
  UnknownSettings,
  findProtection,
  getAllProtections,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  DeadDocumentJSX,
  DocumentNode,
  StringPresentationType,
  TopPresentationSchema,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";
import { DraupnirContextToCommandContextTranslator, DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirProtectionsEnableCommand = describeCommand({
  summary: "Enable a named protection.",
  parameters: tuple({
    name: "protection name",
    acceptor: StringPresentationType,
  }),
  keywords: {
    keywordDescriptions: {
      "consequence-provider": {
        acceptor: StringPresentationType,
        description:
          "The name of a consequence provider to use for this protection.",
      },
    },
  },
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    protectionName
  ): Promise<Result<void>> {
    const protectionDescription = findProtection(protectionName);
    if (protectionDescription === undefined) {
      return ActionError.Result(
        `Couldn't find a protection named ${protectionName}`
      );
    }
    const capabilityProviderSet =
      await draupnir.protectedRoomsSet.protections.getCapabilityProviderSet(
        protectionDescription
      );
    if (isError(capabilityProviderSet)) {
      return capabilityProviderSet.elaborate(
        `Couldn't load the capability provider set for the protection ${protectionName}`
      );
    }
    return await draupnir.protectedRoomsSet.protections.addProtection(
      protectionDescription,
      capabilityProviderSet.ok,
      draupnir.protectedRoomsSet,
      draupnir
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirProtectionsEnableCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

export const DraupnirProtectionsDisableCommand = describeCommand({
  summary: "Disable a named protection.",
  parameters: tuple({
    name: "protection name",
    acceptor: StringPresentationType,
  }),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    protectionName
  ): Promise<Result<void>> {
    const protectionDescription = findProtection(protectionName);
    if (protectionDescription === undefined) {
      return ActionError.Result(
        `Couldn't find a protection named ${protectionName}`
      );
    }
    if (
      !draupnir.protectedRoomsSet.protections.isEnabledProtection(
        protectionDescription
      )
    ) {
      return ActionError.Result(
        `The protection named ${protectionDescription.name} is currently disabled`
      );
    }
    return await draupnir.protectedRoomsSet.protections.removeProtection(
      protectionDescription
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirProtectionsDisableCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

const CommonProtectionSettingParameters = tuple(
  {
    name: "protection name",
    acceptor: StringPresentationType,
    description: "The name of the protection to be modified.",
  },
  {
    name: "setting name",
    acceptor: StringPresentationType,
    description:
      "The name of the setting within the protection config to modify.",
  }
);

interface SettingChangeSummary<
  Key extends string = string,
  TSettings extends UnknownSettings<string> = UnknownSettings<string>,
> {
  readonly oldValue: unknown;
  readonly newValue: unknown;
  readonly description: ProtectionSetting<Key, TSettings>;
}

export type ProtectionsConfigCommandContext<ProtectionContext = unknown> = {
  readonly protectionContext: ProtectionContext;
  readonly protectionsManager: ProtectionsManager<ProtectionContext>;
  readonly protectedRoomsSet: ProtectedRoomsSet;
}

export const DraupnirProtectionsConfigSetCommand = describeCommand({
  summary:
    "Set a new value for the protection setting, if the setting is a collection then this will write over the entire collection.",
  parameters: tuple(...CommonProtectionSettingParameters, {
    name: "new value",
    acceptor: TopPresentationSchema,
    description: "The new value to give the protection setting",
  }),
  async executor(
    { protectionsManager, protectionContext, protectedRoomsSet }: ProtectionsConfigCommandContext,
    _info,
    _keywords,
    _rest,
    protectionName,
    settingName,
    value
  ): Promise<Result<SettingChangeSummary>> {
    const detailsResult = await findSettingDetailsForCommand(
      protectionsManager,
      protectionName,
      settingName
    );
    if (isError(detailsResult)) {
      return detailsResult;
    }
    const details = detailsResult.ok;
    const newSettings = details.protectionSettings.setValue(
      details.previousSettings,
      settingName,
      value
    );
    if (isError(newSettings)) {
      return newSettings;
    }
    return await changeSettingsForCommands(
      protectionContext,
      protectedRoomsSet,
      protectionsManager,
      details,
      settingName,
      newSettings.ok
    );
  },
});

export const DraupnirProtectionsConfigAddCommand = describeCommand({
  summary: "Add an item to a collection protection setting.",
  parameters: tuple(...CommonProtectionSettingParameters, {
    name: "item",
    acceptor: TopPresentationSchema,
    description: "An item to add to the collection setting.",
  }),
  async executor(
    { protectionsManager, protectionContext, protectedRoomsSet }: ProtectionsConfigCommandContext,
    _info,
    _keywords,
    _rest,
    protectionName,
    settingName,
    value
  ): Promise<Result<SettingChangeSummary>> {
    const detailsResult = await findSettingDetailsForCommand(
      protectionsManager,
      protectionName,
      settingName
    );
    if (isError(detailsResult)) {
      return detailsResult;
    }
    const details = detailsResult.ok;
    const settingDescription = details.settingDescription;
    if (!settingDescription.isCollectionSetting()) {
      return ActionError.Result(
        `${protectionName}'s setting ${settingName} is not a collection protection setting, and cannot be used with the add or remove commands.`
      );
    }
    const newSettings = settingDescription.addItem(
      details.previousSettings,
      value
    );
    if (isError(newSettings)) {
      return newSettings;
    }
    return await changeSettingsForCommands(
      protectionContext,
      protectedRoomsSet,
      protectionsManager,
      details,
      settingName,
      newSettings.ok
    );
  },
});

export const DraupnirProtectionsConfigRemoveCommand = describeCommand({
  summary: "Remove an item from a collection protection setting.",
  parameters: tuple(...CommonProtectionSettingParameters, {
    name: "item",
    acceptor: TopPresentationSchema,
    description: "An item to add to the collection setting.",
  }),
  async executor(
    { protectionsManager, protectionContext, protectedRoomsSet }: ProtectionsConfigCommandContext,
    _info,
    _keywords,
    _rest,
    protectionName,
    settingName,
    value
  ): Promise<Result<SettingChangeSummary>> {
    const detailsResult = await findSettingDetailsForCommand(
      protectionsManager,
      protectionName,
      settingName
    );
    if (isError(detailsResult)) {
      return detailsResult;
    }
    const details = detailsResult.ok;
    const settingDescription = details.settingDescription;
    if (!settingDescription.isCollectionSetting()) {
      return ActionError.Result(
        `${protectionName}'s setting ${settingName} is not a collection protection setting, and cannot be used with the add or remove commands.`
      );
    }
    const newSettings = settingDescription.removeItem(
      details.previousSettings,
      value
    );
    if (isError(newSettings)) {
      return newSettings;
    }
    return await changeSettingsForCommands(
      protectionContext,
      protectedRoomsSet,
      protectionsManager,
      details,
      settingName,
      newSettings.ok
    );
  },
});

function renderSettingChangeSummary(
  summary: SettingChangeSummary
): DocumentNode {
  const oldJSON = summary.description.toJSON({
    [summary.description.key]: summary.oldValue,
  });
  const newJSON = summary.description.toJSON({
    [summary.description.key]: summary.newValue,
  });
  return (
    <fragment>
      Setting {summary.description.key} changed from{" "}
      <code>{JSON.stringify(oldJSON)}</code> to{" "}
      <code>{JSON.stringify(newJSON)}</code>
    </fragment>
  );
}

for (const command of [
  DraupnirProtectionsConfigAddCommand,
  DraupnirProtectionsConfigSetCommand,
  DraupnirProtectionsConfigRemoveCommand,
]) {
  DraupnirInterfaceAdaptor.describeRenderer(command, {
    JSXRenderer(result) {
      if (isError(result)) {
        return Ok(undefined);
      }
      return Ok(<root>{renderSettingChangeSummary(result.ok)}</root>);
    },
  });
  DraupnirContextToCommandContextTranslator.registerTranslation(command, function (draupnir: Draupnir) {
    return {
      protectionContext: draupnir,
      protectionsManager: draupnir.protectedRoomsSet.protections,
      protectedRoomsSet: draupnir.protectedRoomsSet,
    };
  });
}

function findProtectionDescriptionForCommand(
  protectionName: string
): ActionResult<ProtectionDescription> {
  const protectionDescription = findProtection(protectionName);
  if (protectionDescription === undefined) {
    return ActionError.Result(
      `Couldn't find a protection named ${protectionName}`
    );
  }
  return Ok(protectionDescription);
}

function findSettingDescriptionForCommand(
  settings: ProtectionSettings,
  settingName: string
): ActionResult<ProtectionSetting<string, UnknownSettings<string>>> {
  const setting = settings.getDescription(settingName);
  if (setting === undefined) {
    return ActionError.Result(
      `Unable to find a protection setting named ${settingName}`
    );
  }
  return Ok(setting);
}

interface SettingDetails<
  TSettings extends UnknownSettings<string> = UnknownSettings<string>,
> {
  readonly protectionDescription: ProtectionDescription<Draupnir, TSettings>;
  readonly protectionSettings: ProtectionSettings;
  readonly settingDescription: ProtectionSetting<string, TSettings>;
  readonly previousSettings: TSettings;
}

async function findSettingDetailsForCommand(
  protectionsManager: ProtectionsManager,
  protectionName: string,
  settingName: string
): Promise<ActionResult<SettingDetails>> {
  const protectionDescription =
    findProtectionDescriptionForCommand(protectionName);
  if (isError(protectionDescription)) {
    return protectionDescription;
  }
  const settingsDescription = protectionDescription.ok.protectionSettings;
  const settingDescription = findSettingDescriptionForCommand(
    settingsDescription,
    settingName
  );
  if (isError(settingDescription)) {
    return settingDescription;
  }
  const previousSettings =
    await protectionsManager.getProtectionSettings(
      protectionDescription.ok
    );
  if (isError(previousSettings)) {
    return previousSettings;
  }
  return Ok({
    protectionDescription: protectionDescription.ok,
    protectionSettings: settingsDescription,
    settingDescription: settingDescription.ok,
    previousSettings: previousSettings.ok,
  });
}

// So I'm thinking instead that we're going to move to the PersistentConfigData
// thingy for protection settings. Wouldn't it make sense to make a plan for that,
// consider how recovery would work, and how to unit test evertyhing, then
// do that.

async function changeSettingsForCommands<
  ProtectionContext = unknown,
  TSettings extends UnknownSettings<string> = UnknownSettings<string>,
>(
  context: ProtectionContext,
  protectedRoomsSet: ProtectedRoomsSet,
  protectionsManager: ProtectionsManager<ProtectionContext>,
  details: SettingDetails<TSettings>,
  settingName: string,
  newSettings: TSettings
): Promise<ActionResult<SettingChangeSummary>> {
  const changeResult =
    await protectedRoomsSet.protections.changeProtectionSettings(
      details.protectionDescription,
      protectedRoomsSet,
      context,
      newSettings
    );
  if (isError(changeResult)) {
    return changeResult;
  }
  return Ok({
    description: details.settingDescription,
    oldValue: details.previousSettings[settingName],
    newValue: newSettings[settingName],
  });
}

interface ProtectionsSummary {
  readonly description: ProtectionDescription;
  readonly isEnabled: boolean;
  readonly protection?: Protection<ProtectionDescription>;
}

export const DraupnirListProtectionsCommand = describeCommand({
  summary: "List all available protections.",
  parameters: [],
  async executor(draupnir: Draupnir): Promise<Result<ProtectionsSummary[]>> {
    const enabledProtections =
      draupnir.protectedRoomsSet.protections.allProtections;
    const summaries: ProtectionsSummary[] = [];
    for (const protectionDescription of getAllProtections()) {
      const enabledProtection = enabledProtections.find(
        (p) => p.description.name === protectionDescription.name
      );
      if (enabledProtection !== undefined) {
        summaries.push({
          description: protectionDescription,
          protection: enabledProtection,
          isEnabled: true,
        });
      } else {
        summaries.push({
          description: protectionDescription,
          isEnabled: false,
        });
      }
    }
    return Ok(summaries);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirListProtectionsCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    return Ok(<root>{renderProtectionsSummary(result.ok)}</root>);
  },
});

function renderProtectionsSummary(
  protectionsSummary: ProtectionsSummary[]
): DocumentNode {
  return (
    <fragment>
      Available protections:
      <ul>
        {protectionsSummary.map((summary) => (
          <li>
            {summary.isEnabled ? "🟢 (enabled)" : "🔴 (disabled)"}
            <code>{summary.description.name}</code> -{" "}
            {summary.description.description}
          </li>
        ))}
      </ul>
    </fragment>
  );
}

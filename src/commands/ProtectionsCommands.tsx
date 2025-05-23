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
  ConfigDescription,
  ConfigParseError,
  EDStatic,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  ProtectionsManager,
  UnknownConfig,
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
import { isOk, Result } from "@gnuxie/typescript-result";
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";
import { StandardPersistentConfigRenderer } from "../safemode/PersistentConfigRenderer";
import { ServerAdminProtections } from "../protections/ConfigHooks";

export const DraupnirProtectionsEnableCommand = describeCommand({
  summary: "Enable a named protection.",
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
    return await draupnir.protectedRoomsSet.protections.addProtection(
      protectionDescription,
      draupnir.protectedRoomsSet,
      draupnir
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirProtectionsEnableCommand, {
  JSXRenderer(result) {
    if (isOk(result)) {
      return Ok(undefined);
    }
    if (result.error instanceof ConfigParseError) {
      return Ok(
        <root>
          <p>
            Use the <code>!draupnir protections show</code> and{" "}
            <code>!draupnir protections config remove</code> commands to modify
            invalid values. Alternatively reset the protection settings to
            default with <code>!draupnir protections config reset</code>.
          </p>
          {result.error.mostRelevantElaboration}
          <br />
          {StandardPersistentConfigRenderer.renderConfigStatus({
            description: result.error.configDescription,
            data: result.error.config,
            error: result.error,
          })}
        </root>
      );
    }
    // let the default renderer handle the error.
    return Ok(undefined);
  },
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
  TConfig extends UnknownConfig = UnknownConfig,
  Key extends keyof EDStatic<TConfig> = keyof EDStatic<TConfig>,
> {
  readonly oldValue: EDStatic<TConfig>[Key];
  readonly newValue: EDStatic<TConfig>[Key];
  readonly propertyKey: Key;
  readonly description: ConfigDescription<TConfig>;
}

export type ProtectionsConfigCommandContext<ProtectionContext = unknown> = {
  readonly protectionContext: ProtectionContext;
  readonly protectionsManager: ProtectionsManager<ProtectionContext>;
  readonly protectedRoomsSet: ProtectedRoomsSet;
};

export const DraupnirProtectionsConfigSetCommand = describeCommand({
  summary:
    "Set a new value for the protection setting, if the setting is a collection then this will write over the entire collection.",
  parameters: tuple(...CommonProtectionSettingParameters, {
    name: "new value",
    acceptor: TopPresentationSchema,
    description: "The new value to give the protection setting",
  }),
  async executor(
    {
      protectionsManager,
      protectionContext,
      protectedRoomsSet,
    }: ProtectionsConfigCommandContext,
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
    const newSettings = details.description
      .toMirror()
      .setValue(details.previousSettings, settingName, value);
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
    {
      protectionsManager,
      protectionContext,
      protectedRoomsSet,
    }: ProtectionsConfigCommandContext,
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
    const propertyDescription =
      details.description.getPropertyDescription(settingName);
    if (!propertyDescription.isArray) {
      return ActionError.Result(
        `${protectionName}'s setting ${settingName} is not a collection protection setting, and cannot be used with the add or remove commands.`
      );
    }
    const newSettings = details.description
      .toMirror()
      // We technically need to print the argument "ready" but i don't think
      // we have a way to do that.
      // at least without getting the argument from the argument stream in
      // interface-manager so that we still have its presentation type.
      .addSerializedItem(details.previousSettings, settingName, String(value));
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
    {
      protectionsManager,
      protectionContext,
      protectedRoomsSet,
    }: ProtectionsConfigCommandContext,
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
    const settingDescription = details.description;
    const propertyDescription =
      settingDescription.getPropertyDescription(settingName);
    if (!propertyDescription.isArray) {
      return ActionError.Result(
        `${protectionName}'s setting ${settingName} is not a collection protection setting, and cannot be used with the add or remove commands.`
      );
    }
    const newSettings = settingDescription
      .toMirror()
      .filterItems(
        details.previousSettings,
        settingName,
        (item) => item !== value
      );
    return await changeSettingsForCommands(
      protectionContext,
      protectedRoomsSet,
      protectionsManager,
      details,
      // Yeha I know this sucks but either fix it or fuck off, it'll be fine.
      settingName as never,
      newSettings.ok as never
    );
  },
});

function renderSettingChangeSummary(
  summary: SettingChangeSummary
): DocumentNode {
  const renderProperty = (value: unknown) => {
    if (Array.isArray(value)) {
      return value.join(", ");
    }
    return String(value);
  };
  return (
    <fragment>
      Setting {summary.propertyKey} changed from{" "}
      <code>{renderProperty(summary.oldValue)}</code> to{" "}
      <code>{renderProperty(summary.newValue)}</code>
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
  DraupnirContextToCommandContextTranslator.registerTranslation(
    command,
    function (draupnir: Draupnir) {
      return {
        protectionContext: draupnir,
        protectionsManager: draupnir.protectedRoomsSet.protections,
        protectedRoomsSet: draupnir.protectedRoomsSet,
      };
    }
  );
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

interface SettingDetails<
  TConfig extends UnknownConfig = UnknownConfig,
  Key extends keyof EDStatic<TConfig> = keyof EDStatic<TConfig>,
> {
  readonly protectionDescription: ProtectionDescription<Draupnir, TConfig>;
  readonly previousSettings: EDStatic<TConfig>;
  readonly propertyKey: Key;
  readonly description: ConfigDescription<TConfig>;
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
  const previousSettings = await protectionsManager.getProtectionSettings(
    protectionDescription.ok
  );
  if (isError(previousSettings)) {
    return previousSettings;
  }
  return Ok({
    protectionDescription: protectionDescription.ok,
    propertyKey:
      settingName as keyof typeof settingsDescription.schema.properties,
    description: protectionDescription.ok.protectionSettings,
    previousSettings: previousSettings.ok,
  });
}

// So I'm thinking instead that we're going to move to the PersistentConfigData
// thingy for protection settings. Wouldn't it make sense to make a plan for that,
// consider how recovery would work, and how to unit test everything, then
// do that.

async function changeSettingsForCommands<
  ProtectionContext = unknown,
  TConfig extends UnknownConfig = UnknownConfig,
>(
  context: ProtectionContext,
  protectedRoomsSet: ProtectedRoomsSet,
  protectionsManager: ProtectionsManager<ProtectionContext>,
  details: SettingDetails<TConfig>,
  settingName: string,
  newSettings: EDStatic<TConfig>
): Promise<ActionResult<SettingChangeSummary<TConfig>>> {
  const changeResult =
    await protectedRoomsSet.protections.changeProtectionSettings(
      details.protectionDescription as unknown as ProtectionDescription,
      protectedRoomsSet,
      context,
      newSettings
    );
  if (isError(changeResult)) {
    return changeResult;
  }
  return Ok({
    description: details.description,
    oldValue: details.previousSettings[settingName as keyof EDStatic<TConfig>],
    newValue: newSettings[settingName as keyof EDStatic<TConfig>],
    propertyKey: settingName as keyof EDStatic<TConfig>,
  });
}

interface ProtectionsSummary {
  readonly description: ProtectionDescription;
  readonly isEnabled: boolean;
  readonly protection?: Protection<ProtectionDescription>;
}

function sortProtectionsListByEnabledAndAlphanumerical(
  summaries: ProtectionsSummary[]
): ProtectionsSummary[] {
  return summaries.sort((a, b) => {
    if (a.isEnabled && !b.isEnabled) {
      return -1;
    }
    if (!a.isEnabled && b.isEnabled) {
      return 1;
    }
    return a.description.name.localeCompare(b.description.name);
  });
}

export const DraupnirProtectionsConfigResetCommand = describeCommand({
  summary: "Reset the protection settings for a named protection",
  parameters: tuple({
    name: "protection name",
    acceptor: StringPresentationType,
    description: "The name of the protection to be modified.",
  }),
  async executor(draupnir: Draupnir, _info, _keywords, _rest, protectionName) {
    const protectionDescription = findProtection(protectionName);
    if (protectionDescription === undefined) {
      return ActionError.Result(
        `Couldn't find a protection named ${protectionName}`
      );
    }
    const newSettings =
      protectionDescription.protectionSettings.getDefaultConfig();
    return await draupnir.protectedRoomsSet.protections.changeProtectionSettings(
      protectionDescription as unknown as ProtectionDescription,
      draupnir.protectedRoomsSet,
      draupnir,
      newSettings
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(
  DraupnirProtectionsConfigResetCommand,
  {
    isAlwaysSupposedToUseDefaultRenderer: true,
  }
);

export const DraupnirProtectionsCapabilityResetCommand = describeCommand({
  summary: "Use the default set of capabilities for the named protection",
  parameters: tuple({
    name: "protection name",
    acceptor: StringPresentationType,
    description: "The name of the protection to be modified.",
  }),
  async executor(draupnir: Draupnir, _info, _keywords, _rest, protectionName) {
    const protectionDescription = findProtection(protectionName);
    if (protectionDescription === undefined) {
      return ActionError.Result(
        `Couldn't find a protection named ${protectionName}`
      );
    }
    return await draupnir.protectedRoomsSet.protections.changeCapabilityProviderSet(
      protectionDescription as unknown as ProtectionDescription,
      draupnir.protectedRoomsSet,
      draupnir,
      protectionDescription.defaultCapabilities
    );
  },
});

DraupnirInterfaceAdaptor.describeRenderer(
  DraupnirProtectionsCapabilityResetCommand,
  {
    isAlwaysSupposedToUseDefaultRenderer: true,
  }
);

export const DraupnirListProtectionsCommand = describeCommand({
  summary: "List all available protections.",
  parameters: [],
  async executor(draupnir: Draupnir): Promise<Result<ProtectionsSummary[]>> {
    const enabledProtections =
      draupnir.protectedRoomsSet.protections.allProtections;
    const summaries: ProtectionsSummary[] = [];
    for (const protectionDescription of getAllProtections()) {
      if (
        draupnir.synapseHTTPAntispam === undefined &&
        ServerAdminProtections.includes(protectionDescription as never)
      ) {
        continue; // these protections will error if enabled
      }
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
    return Ok(sortProtectionsListByEnabledAndAlphanumerical(summaries));
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
      To show details about a specific protection, use{" "}
      <code>
        !draupnir protections show {"<"}protection name{">"}
      </code>{" "}
      command.
      <br />
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

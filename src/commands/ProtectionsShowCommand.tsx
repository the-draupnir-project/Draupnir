// Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  DeadDocumentJSX,
  DocumentNode,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  CapabilityProviderDescription,
  CapabilityProviderSet,
  Protection,
  ProtectionDescription,
  findProtection,
} from "matrix-protection-suite";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";
import { StandardPersistentConfigRenderer } from "../safemode/PersistentConfigRenderer";

type ProtectionShowInfo = {
  readonly description: ProtectionDescription;
  readonly isEnabled: boolean;
  readonly protection: Protection<ProtectionDescription> | undefined;
  readonly config: Record<string, unknown>;
  readonly activeCapabilityProviderSet: CapabilityProviderSet;
};

export const DraupnirProtectionsShowCommand = describeCommand({
  summary:
    "Show a description of and the configured protection settings for a protection",
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
  ): Promise<Result<ProtectionShowInfo>> {
    const protectionDescription = findProtection(protectionName);
    if (protectionDescription === undefined) {
      return ResultError.Result(
        `Cannot find a protection named ${protectionName}`
      );
    }
    const enabledProtections =
      draupnir.protectedRoomsSet.protections.allProtections;
    const protection = enabledProtections.find(
      (protection) => protection.description === protectionDescription
    );
    const settings =
      await draupnir.protectedRoomsSet.protections.getProtectionSettings(
        protectionDescription
      );
    if (isError(settings)) {
      return settings.elaborate(
        `Unable to fetch the protection settings for the protection ${protectionName}`
      );
    }
    const capabilityProviderSet =
      await draupnir.protectedRoomsSet.protections.getCapabilityProviderSet(
        protectionDescription
      );
    if (isError(capabilityProviderSet)) {
      return capabilityProviderSet.elaborate(
        `Unable to fetch the capability provider set for the protection ${protectionName}`
      );
    }
    return Ok({
      description: protectionDescription,
      isEnabled: protection !== undefined,
      protection,
      config: settings.ok,
      activeCapabilityProviderSet: capabilityProviderSet.ok,
    });
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirProtectionsShowCommand, {
  JSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    const protectionInfo = commandResult.ok;
    return Ok(
      <root>
        <span>
          <code>{protectionInfo.description.name}</code>{" "}
          {protectionInfo.isEnabled ? "🟢 (enabled)" : "🔴 (disabled)"}
        </span>
        <p>{protectionInfo.description.description}</p>
        <h3>Protection settings</h3>
        {StandardPersistentConfigRenderer.renderConfigStatus({
          description: protectionInfo.description.protectionSettings,
          error: undefined,
          data: protectionInfo.config,
        })}
        <p>
          To change a setting, use the{" "}
          <code>
            !draupnir protections config {"<"}add/set/remove{">"}{" "}
            {protectionInfo.description.name} {"<"}property name{">"} {"<"}value
            {">"}
          </code>{" "}
          command. Protections may provide more convienant commands to manage
          their settings.
        </p>

        <h3>Capability provider set</h3>
        {renderCapabilityProviderSet(
          protectionInfo.activeCapabilityProviderSet
        )}
      </root>
    );
  },
});

function renderCapabilityProvider(
  name: string,
  capabilityProvider: CapabilityProviderDescription
): DocumentNode {
  return (
    <fragment>
      <p>
        <code>{name}</code>: interface:{" "}
        <code>{capabilityProvider.interface.name}</code>
        provider: <code>{capabilityProvider.name}</code>
      </p>
    </fragment>
  );
}

function renderCapabilityProviderSet(set: CapabilityProviderSet): DocumentNode {
  return (
    <fragment>
      <ul>
        {Object.entries(set).map(([name, provider]) => (
          <li>{renderCapabilityProvider(name, provider)}</li>
        ))}
      </ul>
    </fragment>
  );
}

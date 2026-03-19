// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result, ResultError, isError } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  StringPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import {
  CapabilityProviderDescription,
  ProtectionDescription,
  findCapabilityProvider,
  findProtection,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

// ahh bitch, getting the prompts for capability provider name is going
// to require arguments to be passed through to the prompt function.

type CapabilityProviderChange = {
  protectionDescription: ProtectionDescription;
  oldCapabilityProvider: CapabilityProviderDescription;
  newCapabilityProvider: CapabilityProviderDescription;
  capabilityName: string;
};

export const DraupnirProtectionsCapabilityCommand = describeCommand({
  summary:
    "Change the active capability provider for a specific protection capability.",
  parameters: tuple(
    {
      name: "protection name",
      acceptor: StringPresentationType,
    },
    {
      name: "capability name",
      acceptor: StringPresentationType,
    },
    {
      name: "capability provider name",
      acceptor: StringPresentationType,
    }
  ),
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    _rest,
    protectionName,
    capabilityName,
    capabilityProviderName
  ): Promise<Result<CapabilityProviderChange>> {
    const protectionDescription = findProtection(protectionName);
    if (protectionDescription === undefined) {
      return ResultError.Result(
        `Cannot find a protection named ${protectionName}`
      );
    }
    const capabilityProvider = findCapabilityProvider(capabilityProviderName);
    if (capabilityProvider === undefined) {
      return ResultError.Result(
        `Cannot find a capability provider named ${capabilityProviderName}`
      );
    }
    const oldCapabilitySet =
      await draupnir.protectedRoomsSet.protections.getCapabilityProviderSet(
        protectionDescription
      );
    if (isError(oldCapabilitySet)) {
      return oldCapabilitySet.elaborate(
        "Unable to get the current capability provider"
      );
    }
    const oldCapabilityProvider = oldCapabilitySet.ok[capabilityName];
    if (oldCapabilityProvider === undefined) {
      return ResultError.Result(
        `Unable to find the current capability provider for ${capabilityName}`
      );
    }
    const changeResult =
      await draupnir.protectedRoomsSet.protections.changeCapabilityProvider(
        draupnir,
        draupnir.protectedRoomsSet,
        protectionDescription,
        capabilityName,
        capabilityProvider
      );
    if (isError(changeResult)) {
      return changeResult.elaborate(
        "Unable to change the active capability provider"
      );
    }
    return Ok({
      protectionDescription,
      oldCapabilityProvider: oldCapabilityProvider,
      newCapabilityProvider: capabilityProvider,
      capabilityName,
    });
  },
});

DraupnirInterfaceAdaptor.describeRenderer(
  DraupnirProtectionsCapabilityCommand,
  {
    JSXRenderer(commandResult) {
      if (isError(commandResult)) {
        return Ok(undefined);
      }
      return Ok(
        <root>
          Changed the capability provider for{" "}
          <code>{commandResult.ok.capabilityName}</code> from{" "}
          <code>{commandResult.ok.oldCapabilityProvider.name}</code> to{" "}
          <code>{commandResult.ok.newCapabilityProvider.name}</code>
        </root>
      );
    },
  }
);

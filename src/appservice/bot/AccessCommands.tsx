// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  defineInterfaceCommand,
  findTableCommand,
} from "../../commands/interface-manager/InterfaceCommand";
import {
  findPresentationType,
  parameters,
  ParsedKeywords,
} from "../../commands/interface-manager/ParameterParsing";
import { AppserviceContext } from "./AppserviceCommandHandler";
import { UserID, ActionResult } from "matrix-protection-suite";
import { defineMatrixInterfaceAdaptor } from "../../commands/interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "../../commands/interface-manager/MatrixHelpRenderer";

defineInterfaceCommand({
  designator: ["allow"],
  table: "appservice bot",
  parameters: parameters([
    {
      name: "user",
      acceptor: findPresentationType("UserID"),
      description: "The user that should be allowed to provision a bot",
    },
  ]),
  command: async function (
    this: AppserviceContext,
    _keywords: ParsedKeywords,
    user: UserID
  ): Promise<ActionResult<void>> {
    return await this.appservice.accessControl.allow(user.toString());
  },
  summary:
    "Allow a user to provision themselves a draupnir using the appservice.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("appservice bot", "allow"),
  renderer: tickCrossRenderer,
});

defineInterfaceCommand({
  designator: ["remove"],
  table: "appservice bot",
  parameters: parameters([
    {
      name: "user",
      acceptor: findPresentationType("UserID"),
      description:
        "The user which shall not be allowed to provision bots anymore",
    },
  ]),
  command: async function (
    this: AppserviceContext,
    _keywords: ParsedKeywords,
    user: UserID
  ): Promise<ActionResult<void>> {
    return await this.appservice.accessControl.remove(user.toString());
  },
  summary: "Stop a user from using any provisioned draupnir in the appservice.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("appservice bot", "remove"),
  renderer: tickCrossRenderer,
});

// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import { ActionResult } from "matrix-protection-suite";
import {
  MatrixUserIDPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotCommandDispatcher";

export const AppserviceAllowCommand = describeCommand({
  parameters: tuple({
    name: "user",
    acceptor: MatrixUserIDPresentationType,
    description: "The user that should be allowed to provision a bot",
  }),
  summary:
    "Allow a user to provision themselves a draupnir using the appservice.",
  async executor(
    context: AppserviceAdaptorContext,
    _info,
    _keywords,
    _rest,
    user
  ): Promise<ActionResult<void>> {
    return await context.appservice.accessControl.allow(user.toString());
  },
});

AppserviceBotInterfaceAdaptor.describeRenderer(AppserviceAllowCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

export const AppserviceRemoveCommand = describeCommand({
  parameters: tuple({
    name: "user",
    acceptor: MatrixUserIDPresentationType,
    description:
      "The user which shall not be allowed to provision bots anymore",
  }),
  summary: "Stop a user from using any provisioned draupnir in the appservice.",
  async executor(
    context: AppserviceAdaptorContext,
    _info,
    _keywords,
    _rest,
    user
  ): Promise<ActionResult<void>> {
    return await context.appservice.accessControl.remove(user.toString());
  },
});

AppserviceBotInterfaceAdaptor.describeRenderer(AppserviceRemoveCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

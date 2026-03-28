// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import { ActionResult, isError, Ok } from "matrix-protection-suite";
import {
  MatrixUserIDPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotInterfaceAdaptor";

export const AppserviceProvisionForUserCommand = describeCommand({
  parameters: tuple({
    name: "user",
    acceptor: MatrixUserIDPresentationType,
    description:
      "The user to provision a bot for, bypassing user allocation limit",
  }),
  summary:
    "Provision a new Draupnir for a user while bypassing the per-user allocation limit.",
  async executor(
    context: AppserviceAdaptorContext,
    _info,
    _keywords,
    _rest,
    user
  ): Promise<ActionResult<void>> {
    const result =
      await context.appservice.draupnirManager.provisionNewDraupnirBypassingUserLimit(
        user.toString()
      );
    if (isError(result)) {
      return result;
    }
    return Ok(undefined);
  },
});

AppserviceBotInterfaceAdaptor.describeRenderer(
  AppserviceProvisionForUserCommand,
  {
    isAlwaysSupposedToUseDefaultRenderer: true,
  }
);

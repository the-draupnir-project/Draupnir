// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import { ActionResult, isError, Ok } from "matrix-protection-suite";
import {
  StringPresentationType,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotInterfaceAdaptor";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";

export const AppserviceDisplaynameCommand = describeCommand({
  summary: "Sets the displayname of the main appservice admin bot.",
  parameters: [],
  rest: {
    name: "displayname",
    acceptor: StringPresentationType,
  },
  async executor(
    context: AppserviceAdaptorContext,
    _info,
    _keywords,
    displaynameParts
  ): Promise<ActionResult<void>> {
    const displayname = displaynameParts.join(" ");
    const setDisplaynameResult = await context.client
      .setDisplayName(displayname)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
    if (isError(setDisplaynameResult)) {
      return setDisplaynameResult.elaborate(
        `Failed to set appservice bot displayname to ${displayname}`
      );
    }
    return setDisplaynameResult;
  },
});

AppserviceBotInterfaceAdaptor.describeRenderer(AppserviceDisplaynameCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

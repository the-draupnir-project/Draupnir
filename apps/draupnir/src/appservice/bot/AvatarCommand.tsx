// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import {
  ActionResult,
  isError,
  Ok,
  ActionError,
} from "matrix-protection-suite";
import {
  StringPresentationType,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { isStringMediaURI } from "@the-draupnir-project/matrix-basic-types";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotInterfaceAdaptor";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";

export const AppserviceAvatarCommand = describeCommand({
  summary: "Sets the avatar of the main appservice admin bot.",
  parameters: [],
  rest: {
    name: "avatar url",
    acceptor: StringPresentationType,
  },
  async executor(
    context: AppserviceAdaptorContext,
    _info,
    _keywords,
    avatarParts
  ): Promise<ActionResult<void>> {
    const avatarUrl = avatarParts.join(" ").trim();
    if (!avatarUrl) {
      return ActionError.Result("Avatar URL cannot be empty");
    }
    if (!isStringMediaURI(avatarUrl)) {
      return ActionError.Result(
        `Invalid MXC URI format. Expected format: mxc://server/media-id, got: ${avatarUrl}`
      );
    }
    const setAvatarResult = await context.client
      .setAvatarUrl(avatarUrl)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
    if (isError(setAvatarResult)) {
      return setAvatarResult.elaborate(
        `Failed to set appservice bot avatar to ${avatarUrl}`
      );
    }
    return setAvatarResult;
  },
});

AppserviceBotInterfaceAdaptor.describeRenderer(AppserviceAvatarCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  StringPresentationType,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { isStringMXCURI } from "@the-draupnir-project/matrix-basic-types";
import { Draupnir } from "../Draupnir";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";
import { ActionError } from "matrix-protection-suite";

export const DraupnirAvatarCommand = describeCommand({
  summary:
    "Sets the avatar of the draupnir instance to the specified MXC URI in all rooms.",
  parameters: [],
  rest: {
    name: "avatar_url",
    acceptor: StringPresentationType,
  },
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    avatarParts
  ): Promise<Result<void>> {
    const avatarUrl = avatarParts.join(" ").trim();
    if (!avatarUrl) {
      return ActionError.Result("Avatar URL cannot be empty");
    }
    if (!isStringMXCURI(avatarUrl)) {
      return ActionError.Result(
        `Invalid MXC URI format. Expected format: mxc://server/media-id, got: ${avatarUrl}`
      );
    }
    const setAvatarResult = await draupnir.client
      .setAvatarUrl(avatarUrl)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
    if (isError(setAvatarResult)) {
      return setAvatarResult.elaborate(`Failed to set avatar to ${avatarUrl}`);
    }
    return setAvatarResult;
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirAvatarCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

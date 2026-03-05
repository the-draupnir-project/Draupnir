// Copyright 2023 Marcel <MTRNord@users.noreply.github.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result } from "@gnuxie/typescript-result";
import {
  StringPresentationType,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { ActionError } from "matrix-protection-suite";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";

export const DraupnirDisplaynameCommand = describeCommand({
  summary:
    "Sets the displayname of the draupnir instance to the specified value in all rooms.",
  parameters: [],
  rest: {
    name: "displayname",
    acceptor: StringPresentationType,
  },
  async executor(
    draupnir: Draupnir,
    _info,
    _keywords,
    displaynameParts
  ): Promise<Result<void>> {
    const displayname = displaynameParts.join(" ");
    const setDisplaynameResult = await draupnir.client
      .setDisplayName(displayname)
      .then((_) => Ok(undefined), resultifyBotSDKRequestError);
    if (isError(setDisplaynameResult)) {
      return setDisplaynameResult.elaborate(
        `Failed to set displayname to ${displayname}`
      );
    }
    return setDisplaynameResult;
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirDisplaynameCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

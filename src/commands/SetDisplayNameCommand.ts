// Copyright 2023 Marcel <MTRNord@users.noreply.github.com>
//
// SPDX-License-Identifier: AFL-3.0

import { Ok, Result } from "@gnuxie/typescript-result";
import {
  StringPresentationType,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { ActionError } from "matrix-protection-suite";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

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
    try {
      await draupnir.client.setDisplayName(displayname);
    } catch (e) {
      const message = e.message || (e.body ? e.body.error : "<no message>");
      return ActionError.Result(
        `Failed to set displayname to ${displayname}: ${message}`
      );
    }
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirDisplaynameCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

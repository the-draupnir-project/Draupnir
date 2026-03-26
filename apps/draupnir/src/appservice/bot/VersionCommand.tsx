// Copyright 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import { ActionResult, Ok, isError } from "matrix-protection-suite";
import {
  DeadDocumentJSX,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotInterfaceAdaptor";
import { CURRENT_BRANCH, SOFTWARE_VERSION } from "../../config";

type AppserviceVersionInfo = {
  version: string;
  branch: string;
};

export const AppserviceVersionCommand = describeCommand({
  summary:
    "Show Draupnir version and branch information for this appservice deployment.",
  parameters: [],
  async executor(
    _context: AppserviceAdaptorContext
  ): Promise<ActionResult<AppserviceVersionInfo>> {
    return Ok({
      version: SOFTWARE_VERSION,
      branch: CURRENT_BRANCH,
    });
  },
});

AppserviceBotInterfaceAdaptor.describeRenderer(AppserviceVersionCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    return Ok(
      <root>
        <b>Version: </b>
        <code>{result.ok.version}</code>
        <br />
        <b>Branch: </b>
        <code>{result.ok.branch}</code>
      </root>
    );
  },
});

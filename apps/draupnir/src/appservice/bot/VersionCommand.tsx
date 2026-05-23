// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import { ActionResult, Ok, isError } from "matrix-protection-suite";
import {
  DeadDocumentJSX,
  describeCommand,
} from "@the-draupnir-project/interface-manager";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotInterfaceAdaptor";
import { CURRENT_BRANCH, SOFTWARE_VERSION, DISTRIBUTION } from "../../config";

type AppserviceVersionInfo = {
  version: string;
  branch: string;
  distribution: string;
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
      distribution: DISTRIBUTION,
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
        <br />
        <b>Distribution: </b>
        <code>{result.ok.distribution}</code>
      </root>
    );
  },
});

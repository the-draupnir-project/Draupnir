// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Ok, isError } from "matrix-protection-suite";
import {
  CommandTable,
  DocumentNode,
  DeadDocumentJSX,
  describeCommand,
  describeRestParameters,
} from "@the-draupnir-project/interface-manager";
import { DraupnirTopLevelCommands } from "./DraupnirCommandTable";
import { TopPresentationSchema } from "@the-draupnir-project/interface-manager/dist/Command/PresentationSchema";
import { renderTableHelp } from "./interface-manager/MatrixHelpRenderer";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

function renderDraupnirHelp(mjolnirTable: CommandTable): DocumentNode {
  return <root>{renderTableHelp(mjolnirTable)}</root>;
}

export const DraupnirHelpCommand = describeCommand({
  async executor() {
    return Ok(DraupnirTopLevelCommands);
  },
  parameters: [],
  rest: describeRestParameters({
    name: "command parts",
    acceptor: TopPresentationSchema,
  }),
  summary: "Display this message",
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirHelpCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      throw new TypeError(
        `We should always be able to get the base command table`
      );
    } else {
      return Ok(renderDraupnirHelp(result.ok));
    }
  },
});

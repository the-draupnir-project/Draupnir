// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { renderRoomPill } from "./interface-manager/MatrixHelpRenderer";
import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  MatrixRoomAliasPresentationType,
  describeCommand,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../Draupnir";
import { Ok, Result, isError } from "@gnuxie/typescript-result";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export const DraupnirResolveAliasCommand = describeCommand({
  summary: "Resolve a room alias.",
  parameters: tuple({
    name: "alias",
    acceptor: MatrixRoomAliasPresentationType,
  }),
  async executor(
    { clientPlatform }: Draupnir,
    _info,
    _keywords,
    _rest,
    alias
  ): Promise<Result<MatrixRoomID>> {
    return await clientPlatform.toRoomResolver().resolveRoom(alias);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirResolveAliasCommand, {
  JSXRenderer(result) {
    if (isError(result)) {
      return Ok(undefined);
    } else {
      return Ok(
        <root>
          <code>{result.ok.toRoomIDOrAlias()}</code> -{" "}
          {renderRoomPill(result.ok)}
        </root>
      );
    }
  },
});

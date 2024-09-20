// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  ActionError,
  ActionResult,
  isError,
  Ok,
} from "matrix-protection-suite";
import { UnstartedDraupnir } from "../../draupnirfactory/StandardDraupnirManager";
import { AppserviceAdaptorContext } from "./AppserviceBotPrerequisite";
import {
  DeadDocumentJSX,
  describeCommand,
  MatrixUserIDPresentationType,
  tuple,
} from "@the-draupnir-project/interface-manager";
import { AppserviceBotInterfaceAdaptor } from "./AppserviceBotInterfaceAdaptor";

export const AppserviceListUnstartedCommand = describeCommand({
  summary: "List any Draupnir that failed to start.",
  async executor(
    context: AppserviceAdaptorContext
  ): Promise<ActionResult<UnstartedDraupnir[]>> {
    return Ok(context.appservice.draupnirManager.getUnstartedDraupnirs());
  },
  parameters: [],
});

AppserviceBotInterfaceAdaptor.describeRenderer(AppserviceListUnstartedCommand, {
  JSXRenderer: function (result) {
    if (isError(result)) {
      return Ok(undefined);
    }
    const draupnirs = result.ok;
    return Ok(
      <root>
        <b>Unstarted Draupnir: {draupnirs.length}</b>
        <ul>
          {draupnirs.map((draupnir) => {
            return (
              <li>
                <code>{draupnir.clientUserID}</code>
                <code>{draupnir.failType}</code>:
                <br />
                {String(draupnir.cause)}
              </li>
            );
          })}
        </ul>
      </root>
    );
  },
});

export const AppserviceRestartDraupnirCommand = describeCommand({
  summary: "Restart a Draupnir.",
  parameters: tuple({
    name: "draupnir",
    acceptor: MatrixUserIDPresentationType,
    description: "The userid of the draupnir to restart",
  }),
  async executor(
    context: AppserviceAdaptorContext,
    _info,
    _keywords,
    _rest,
    draupnirUser
  ): Promise<ActionResult<void>> {
    const draupnirManager = context.appservice.draupnirManager;
    const draupnir = draupnirManager.findUnstartedDraupnir(
      draupnirUser.toString()
    );
    if (draupnir !== undefined) {
      return ActionError.Result(
        `We can't find the unstarted draupnir ${draupnirUser.toString()}, is it already running?`
      );
    }
    return await draupnirManager.startDraupnirFromMXID(draupnirUser.toString());
  },
});

AppserviceBotInterfaceAdaptor.describeRenderer(
  AppserviceRestartDraupnirCommand,
  {
    isAlwaysSupposedToUseDefaultRenderer: true,
  }
);

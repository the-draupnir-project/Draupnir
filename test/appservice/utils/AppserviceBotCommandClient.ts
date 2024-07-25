// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { ActionResult } from "matrix-protection-suite";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { ReadItem } from "../../../src/commands/interface-manager/CommandReader";
import { findCommandTable } from "../../../src/commands/interface-manager/InterfaceCommand";
import { ArgumentStream } from "../../../src/commands/interface-manager/ParameterParsing";

export class AppservideBotCommandClient {
  constructor(private readonly appservice: MjolnirAppService) {}

  public async sendCommand<CommandReturnType extends ActionResult<unknown>>(
    ...items: ReadItem[]
  ): Promise<CommandReturnType> {
    const stream = new ArgumentStream(items);
    const matchingCommand =
      findCommandTable("appservice bot").findAMatchingCommand(stream);
    if (!matchingCommand) {
      throw new TypeError(
        `Couldn't finnd a command from these items ${JSON.stringify(items)}`
      );
    }
    return (await matchingCommand.parseThenInvoke(
      { appservice: this.appservice },
      stream
    )) as CommandReturnType;
  }
}

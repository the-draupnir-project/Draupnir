// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  ClientPlatform,
  ClientsInRoomMap,
  EventDecoder,
} from "matrix-protection-suite";
import { MatrixSendClient } from "../MatrixEmitter";
import { BotSDKClientPlatform } from "../Client/BotSDKClientPlatform";
import { BotSDKAllClient } from "../Client/BotSDKAllClient";
import { StringUserID } from "@the-draupnir-project/matrix-basic-types";

/**
 * Creates client capabilities that reference a ClientsInRoomMap so that
 * the joined rooms can be preempted consistently.
 */
export class ClientCapabilityFactory {
  public constructor(
    private readonly clientsInRoomMap: ClientsInRoomMap,
    private readonly eventDecoder: EventDecoder
  ) {
    // nothing to do.
  }

  public makeClientPlatform(
    clientUserID: StringUserID,
    client: MatrixSendClient
  ): ClientPlatform {
    const clientRooms = this.clientsInRoomMap.getClientRooms(clientUserID);
    if (clientRooms === undefined) {
      throw new TypeError(
        `Cannot create a client for an untracked user ${clientUserID}`
      );
    }
    return new BotSDKClientPlatform(
      new BotSDKAllClient(client, clientRooms, this.eventDecoder)
    );
  }
}

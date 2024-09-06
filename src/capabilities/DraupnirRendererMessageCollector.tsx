// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  RendererMessage,
  RendererMessageCollector,
} from "./RendererMessageCollector";
import {
  DescriptionMeta,
  RoomMessageSender,
  Task,
} from "matrix-protection-suite";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { sendMatrixEventsFromDeadDocument } from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { Result } from "@gnuxie/typescript-result";

export class DraupnirRendererMessageCollector
  implements RendererMessageCollector
{
  constructor(
    private readonly roomMessageSender: RoomMessageSender,
    private readonly managementRoomID: StringRoomID
  ) {
    // nothing to do.
  }
  private sendMessage(document: DocumentNode): void {
    void Task(
      sendMatrixEventsFromDeadDocument(
        this.roomMessageSender,
        this.managementRoomID,
        <root>{document}</root>,
        {}
      ) as Promise<Result<void>>
    );
  }
  addMessage(protection: DescriptionMeta, message: DocumentNode): void {
    this.sendMessage(message);
  }
  addOneliner(protection: DescriptionMeta, message: DocumentNode): void {
    this.sendMessage(
      <fragment>
        <code>{protection.name}</code>: {message}
      </fragment>
    );
  }
  getMessages(): RendererMessage[] {
    return [];
  }
}

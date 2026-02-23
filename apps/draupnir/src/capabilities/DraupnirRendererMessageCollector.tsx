// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  RendererMessage,
  RendererMessageCollector,
} from "./RendererMessageCollector";
import {
  Capability,
  DescriptionMeta,
  RoomMessageSender,
  Task,
} from "matrix-protection-suite";
import { StringRoomID } from "@the-draupnir-project/matrix-basic-types";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { sendMatrixEventsFromDeadDocument } from "@the-draupnir-project/mps-interface-adaptor";

export class DraupnirRendererMessageCollector
  implements RendererMessageCollector
{
  constructor(
    private readonly roomMessageSender: RoomMessageSender,
    private readonly managementRoomID: StringRoomID
  ) {
    // nothing to do.
  }
  private sendMessage(capability: Capability, document: DocumentNode): void {
    void Task(
      sendMatrixEventsFromDeadDocument(
        this.roomMessageSender,
        this.managementRoomID,
        <root>
          {capability.isSimulated ? (
            <fragment>⚠️ (preview) </fragment>
          ) : (
            <fragment></fragment>
          )}
          {document}
        </root>,
        {}
      )
    );
  }
  addMessage(
    protection: DescriptionMeta,
    capability: Capability,
    message: DocumentNode
  ): void {
    this.sendMessage(capability, message);
  }
  addOneliner(
    protection: DescriptionMeta,
    capability: Capability,
    message: DocumentNode
  ): void {
    this.sendMessage(
      capability,
      <fragment>
        <code>{protection.name}</code>: {message}
      </fragment>
    );
  }
  getMessages(): RendererMessage[] {
    return [];
  }
}

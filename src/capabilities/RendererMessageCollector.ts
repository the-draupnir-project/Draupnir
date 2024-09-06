// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DocumentNode } from "@the-draupnir-project/interface-manager";
import { DescriptionMeta } from "matrix-protection-suite";

export enum MessageType {
  Document = "Document",
  OneLine = "OneLine",
  SingleEffectError = "SingleEffectError",
}

export interface RendererMessageCollector {
  addMessage(protection: DescriptionMeta, message: DocumentNode): void;
  addOneliner(protection: DescriptionMeta, message: DocumentNode): void;
  getMessages(): RendererMessage[];
}

export interface RendererMessage {
  protection: DescriptionMeta;
  message: DocumentNode;
  type: MessageType;
}

/**
 * Used by capabilities to send messages to the users of Draupnir.
 */
export class AbstractRendererMessageCollector
  implements RendererMessageCollector
{
  private readonly messages: RendererMessage[] = [];
  public getMessages(): RendererMessage[] {
    return this.messages;
  }
  addMessage(protection: DescriptionMeta, message: DocumentNode): void {
    this.messages.push({
      protection,
      message,
      type: MessageType.Document,
    });
  }

  addOneliner(protection: DescriptionMeta, message: DocumentNode): void {
    this.messages.push({
      protection,
      message,
      type: MessageType.OneLine,
    });
  }
}

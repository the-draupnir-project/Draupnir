// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { DocumentNode } from "@the-draupnir-project/interface-manager";
import { Capability, DescriptionMeta } from "matrix-protection-suite";

export enum MessageType {
  Document = "Document",
  OneLine = "OneLine",
  SingleEffectError = "SingleEffectError",
}

export interface RendererMessageCollector {
  addMessage(
    protection: DescriptionMeta,
    capability: Capability,
    message: DocumentNode
  ): void;
  addOneliner(
    protection: DescriptionMeta,
    capability: Capability,
    message: DocumentNode
  ): void;
  getMessages(): RendererMessage[];
}

export interface RendererMessage {
  protection: DescriptionMeta;
  capability: Capability;
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
  addMessage(
    protection: DescriptionMeta,
    capability: Capability,
    message: DocumentNode
  ): void {
    this.messages.push({
      protection,
      capability,
      message,
      type: MessageType.Document,
    });
  }

  addOneliner(
    protection: DescriptionMeta,
    capability: Capability,
    message: DocumentNode
  ): void {
    this.messages.push({
      protection,
      capability,
      message,
      type: MessageType.OneLine,
    });
  }
}

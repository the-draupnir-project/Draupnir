// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import {
  describeCapabilityRenderer,
  DescriptionMeta,
  RoomBasicDetails,
} from "matrix-protection-suite";
import { RoomTakedownCapability } from "./RoomTakedownCapability";
import { RendererMessageCollector } from "./RendererMessageCollector";
import {
  MatrixRoomReference,
  StringRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { isError, Result } from "@gnuxie/typescript-result";
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import { renderFailedSingularConsequence } from "./CommonRenderers";
import { renderRoomPill } from "../commands/interface-manager/MatrixHelpRenderer";
import { Draupnir } from "../Draupnir";

function renderCodeOrDefault(
  item: string | undefined,
  defaultText: string
): DocumentNode {
  return item === undefined ? (
    <fragment>{defaultText}</fragment>
  ) : (
    <code>{item}</code>
  );
}

function renderTakedown(
  roomID: StringRoomID,
  details: RoomBasicDetails
): DocumentNode {
  return (
    <details>
      <summary>
        Successfully takendown the room{" "}
        {renderRoomPill(MatrixRoomReference.fromRoomID(roomID))}
      </summary>
      <ul>
        <li>name: {renderCodeOrDefault(details.name, "no name available")}</li>
        <li>
          creator:{" "}
          {renderCodeOrDefault(
            details.creator,
            "creator information unavailable"
          )}
        </li>
        <li>
          topic: {renderCodeOrDefault(details.topic, "topic unavailable")}
        </li>
      </ul>
    </details>
  );
}

class StandardRoomTakedownCapabilityRenderer implements RoomTakedownCapability {
  public readonly requiredEventPermissions =
    this.capability.requiredEventPermissions;
  public readonly requiredPermissions = this.capability.requiredPermissions;
  public readonly requiredStatePermissions =
    this.capability.requiredStatePermissions;
  constructor(
    private readonly description: DescriptionMeta,
    private readonly messageCollector: RendererMessageCollector,
    private readonly capability: RoomTakedownCapability
  ) {
    // nothing to do.
  }

  public async isRoomTakendown(roomID: StringRoomID): Promise<Result<boolean>> {
    // pass this one through without rendering because it doesn't really have a consequence
    return await this.capability.isRoomTakendown(roomID);
  }

  public async takedownRoom(
    roomID: StringRoomID
  ): Promise<Result<RoomBasicDetails>> {
    const capabilityResult = await this.capability.takedownRoom(roomID);
    if (isError(capabilityResult)) {
      this.messageCollector.addOneliner(
        this.description,
        this.capability,
        renderFailedSingularConsequence(
          this.description,
          <span>
            Failed to takedown room{" "}
            {renderRoomPill(MatrixRoomReference.fromRoomID(roomID))}
          </span>,
          capabilityResult.error
        )
      );
      return capabilityResult;
    }
    this.messageCollector.addMessage(
      this.description,
      this.capability,
      renderTakedown(roomID, capabilityResult.ok)
    );
    return capabilityResult;
  }

  public async getRoomDetails(
    roomID: StringRoomID
  ): Promise<Result<RoomBasicDetails>> {
    return await this.capability.getRoomDetails(roomID);
  }
}

describeCapabilityRenderer<RoomTakedownCapability, Draupnir>({
  name: "StandardRoomTakedownCapabilityRenderer",
  description: "Renders the standard room takedown capability result",
  interface: "RoomTakedownCapability",
  isDefaultForInterface: true,
  factory(description, draupnir, capability) {
    return new StandardRoomTakedownCapabilityRenderer(
      description,
      draupnir.capabilityMessageRenderer,
      capability
    );
  },
});

// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { MatrixRoomID } from "@the-draupnir-project/matrix-basic-types";
import { ActionResult, Ok, isError } from "../../../Interface/Action";
import { Task } from "../../../Interface/Task";
import {
  RoomStateRevision,
  StateChange,
} from "../../../StateTracking/StateRevisionIssuer";
import { ProtectedRoomsSet } from "../../ProtectedRoomsSet";
import {
  AbstractProtection,
  Protection,
  ProtectionDescription,
  describeProtection,
} from "../../Protection";
import { UnknownConfig } from "../../../Config/ConfigDescription";
import "./ServerBanSynchronisationCapability";
import "./ServerACLSynchronisationCapability";
import { OwnLifetime } from "../../../Interface/Lifetime";
import {
  ServerBanIntentProjection,
  StandardServerBanIntentProjection,
} from "./ServerBanIntentProjection";
import { ServerBanSynchronisationCapability } from "./ServerBanSynchronisationCapability";
import { Logger } from "../../../Logging/Logger";

const log = new Logger("ServerBanSynchronisationProtection");

// FIXME: We need a linear gate around the server ACL consequence for the entire
// room set.

export class ServerBanSynchronisationProtection
  extends AbstractProtection<
    ProtectionDescription<unknown, UnknownConfig, Capabilities>
  >
  implements
    Protection<
      ProtectionDescription<unknown, UnknownConfig, Capabilities>,
      ServerBanIntentProjection
    >
{
  private readonly capability: ServerBanSynchronisationCapability;
  constructor(
    description: ProtectionDescription<unknown, UnknownConfig, Capabilities>,
    lifetime: OwnLifetime<
      Protection<ProtectionDescription<unknown, UnknownConfig, Capabilities>>
    >,
    capabilities: Capabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    public readonly intentProjection: ServerBanIntentProjection
  ) {
    super(description, lifetime, capabilities, protectedRoomsSet, {});
    this.capability = capabilities.serverConsequences;
  }

  // TODO: We really need a loop detection thing here, we can borrow the infringement
  // count utility from draupinr protections to see if we can unprotect the room
  // if this handle keeps being effectual.
  public async handleStateChange(
    revision: RoomStateRevision,
    changes: StateChange[]
  ): Promise<ActionResult<void>> {
    const serverACLEventChanges = changes.filter(
      (change) => change.eventType === "m.room.server_acl"
    );
    if (serverACLEventChanges.length === 0) {
      return Ok(undefined);
    }
    if (serverACLEventChanges.length !== 1) {
      throw new TypeError(
        `How is it possible for there to be more than one server_acl event change in the same revision?`
      );
    }
    return (await this.capability.outcomeFromIntentInRoom(
      revision.room.toRoomIDOrAlias(),
      this.intentProjection
    )) as ActionResult<void>;
  }

  public handleIntentProjectionNode(): void {
    void Task(
      this.capability.outcomeFromIntentInRoomSet(this.intentProjection),
      { log }
    );
  }

  public handlePermissionRequirementsMet(room: MatrixRoomID): void {
    void Task(
      (async () => {
        await this.capability.outcomeFromIntentInRoom(
          room.toRoomIDOrAlias(),
          this.intentProjection
        );
      })()
    );
  }
}

type Capabilities = {
  serverConsequences: ServerBanSynchronisationCapability;
};

describeProtection<Capabilities>({
  name: "ServerBanSynchronisationProtection",
  description:
    "Synchronise server bans from watched policy lists across the protected rooms set by producing ServerACL events",
  capabilityInterfaces: {
    serverConsequences: "ServerBanSynchronisationCapability",
  },
  defaultCapabilities: {
    serverConsequences: "ServerACLSynchronisationCapability",
  },
  factory: async (
    description,
    lifetime,
    protectedRoomsSet,
    _settings,
    capabilities
  ) => {
    const intentProjection = lifetime.allocateDisposable(() =>
      Ok(
        new StandardServerBanIntentProjection(
          protectedRoomsSet.watchedPolicyRooms.revisionIssuer
        )
      )
    );
    if (isError(intentProjection)) {
      return intentProjection.elaborate("Unable to allocate intent projection");
    }
    return Ok(
      new ServerBanSynchronisationProtection(
        description,
        lifetime,
        capabilities,
        protectedRoomsSet,
        intentProjection.ok
      )
    );
  },
});

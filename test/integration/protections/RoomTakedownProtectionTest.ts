// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MatrixRoomReference,
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { newTestUser } from "../clientHelper";
import { DraupnirTestContext } from "../mjolnirSetupUtils";
import {
  RoomTakedownProtection,
  RoomTakedownProtectionDescription,
} from "../../../src/protections/RoomTakedown/RoomTakedownProtection";
import expect from "expect";
import { Draupnir } from "../../../src/Draupnir";
import {
  findProtection,
  Lifetime,
  parsePolicyRule,
  PolicyRuleChangeType,
  PolicyRuleType,
} from "matrix-protection-suite";
import { SynapseAdminRoomTakedownCapability } from "../../../src/capabilities/SynapseAdminRoomTakedown/SynapseAdminRoomTakedown";
import { StandardDiscoveredRoomStore } from "../../../src/protections/RoomTakedown/DiscoveredRoomStore";
import {
  RoomDiscovery,
  RoomExplorer,
} from "../../../src/protections/RoomTakedown/RoomDiscovery";
import { SynapseHTTPAntispamRoomExplorer } from "../../../src/protections/RoomTakedown/SynapseHTTPAntispamRoomExplorer";

async function createWatchedPolicyRoom(
  draupnir: Draupnir
): Promise<StringRoomID> {
  const policyRoomID = (await draupnir.client.createRoom({
    preset: "public_chat",
  })) as StringRoomID;
  (
    await draupnir.protectedRoomsSet.watchedPolicyRooms.watchPolicyRoomDirectly(
      MatrixRoomReference.fromRoomID(policyRoomID)
    )
  ).expect("Should be able to watch the new policy room");
  return policyRoomID;
}

function createRoomDiscovery(draupnir: Draupnir): RoomDiscovery {
  if (draupnir.stores.hashStore === undefined) {
    throw new TypeError(
      "We need the hash store to create room discvoery store"
    );
  }
  if (draupnir.synapseAdminClient === undefined) {
    throw new TypeError("We need synapseAdminClient mate");
  }
  const detailsProvider = new SynapseAdminRoomTakedownCapability(
    draupnir.synapseAdminClient
  );
  return new StandardDiscoveredRoomStore(
    draupnir.stores.hashStore,
    detailsProvider
  );
}

function createSynapseHTTPAntispamRoomExplorer(
  draupnir: Draupnir,
  roomDiscovery: RoomDiscovery
): RoomExplorer {
  if (draupnir.synapseHTTPAntispam === undefined) {
    throw new TypeError("Draupnir is not configured with SynapseHTTPAntispam");
  }
  return new SynapseHTTPAntispamRoomExplorer(
    draupnir.synapseHTTPAntispam,
    roomDiscovery,
    200
  );
}

function createRoomTakedownProtection(
  lifetime: Lifetime,
  draupnir: Draupnir,
  roomDiscovery: RoomDiscovery,
  explorerers: RoomExplorer[]
): RoomTakedownProtection {
  if (draupnir.stores.hashStore === undefined) {
    throw new TypeError(
      "We need the hash store to create room takedown protection"
    );
  }
  if (draupnir.stores.roomAuditLog === undefined) {
    throw new TypeError(
      "We need the hash store to create room takedown protection"
    );
  }
  if (draupnir.synapseAdminClient === undefined) {
    throw new TypeError("We need synapseAdminClient mate");
  }
  const roomTakedownProtectionDescription = findProtection(
    RoomTakedownProtection.name
  ) as unknown as RoomTakedownProtectionDescription | undefined;
  if (roomTakedownProtectionDescription === undefined) {
    throw new TypeError("unable to find room takedown protection");
  }
  return new RoomTakedownProtection(
    roomTakedownProtectionDescription,
    lifetime.toChild().expect("Should be able to allocate to lifetime"),
    {
      roomTakedownCapability: new SynapseAdminRoomTakedownCapability(
        draupnir.synapseAdminClient
      ),
    },
    draupnir.protectedRoomsSet,
    draupnir.stores.roomAuditLog,
    draupnir.stores.hashStore,
    [],
    draupnir.clientPlatform.toRoomMessageSender(),
    false,
    0,
    draupnir.managementRoomID,
    explorerers,
    roomDiscovery
  );
}

describe("RoomTakedownProtectionTest", function () {
  it("Will takedown a room that is added to the policy list", async function (
    this: DraupnirTestContext
  ) {
    const draupnir = this.draupnir;
    if (draupnir === undefined) {
      throw new TypeError(`setup didn't run properly`);
    }
    const moderator = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "moderator" },
    });
    const moderatorUserID = StringUserID(await moderator.getUserId());
    const takedownTarget = await newTestUser(this.config.homeserverUrl, {
      name: { contains: "takedown-target" },
    });
    const takedownTargetRoomID = StringRoomID(
      await takedownTarget.createRoom({
        preset: "public_chat",
      })
    );
    await moderator.joinRoom(draupnir.managementRoomID);
    const policyRoom = await createWatchedPolicyRoom(draupnir);
    (
      await draupnir.sendTextCommand(
        moderatorUserID,
        `!draupnir protections enable ${RoomTakedownProtection.name}`
      )
    ).expect("Should be able to enable the protection");
    (
      await draupnir.sendTextCommand(
        moderatorUserID,
        `!draupnir takedown ${takedownTargetRoomID} ${policyRoom} --no-confirm`
      )
    ).expect("Should be able to create the policy targetting the room");

    // give some time for the room to be takendown, synapse can be quite slow at this...
    await new Promise((resolve) => setTimeout(resolve, 1000));
    expect(
      draupnir.stores.roomAuditLog?.isRoomTakendown(takedownTargetRoomID)
    ).toBe(true);
    expect(
      (
        await draupnir.clientPlatform
          .toRoomJoiner()
          .joinRoom(takedownTargetRoomID)
      ).isOkay
    ).toBe(false);
  } as unknown as Mocha.AsyncFunc);
  it(
    "Takedown a room through discovery and a revealed Literal policy change",
    async function (this: DraupnirTestContext) {
      const draupnir = this.draupnir;
      if (draupnir === undefined) {
        throw new TypeError(`setup didn't run properly`);
      }
      const synapseHTTPAntispam = draupnir.synapseHTTPAntispam;
      if (synapseHTTPAntispam === undefined) {
        throw new TypeError("Setup code is wrong");
      }
      const moderator = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "moderator" },
      });
      const takedownTarget = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "takedown-target" },
      });
      const takedownTargetRoomID = StringRoomID(
        await takedownTarget.createRoom({
          preset: "public_chat",
        })
      );
      await moderator.joinRoom(draupnir.managementRoomID);
      const policyRoom = await createWatchedPolicyRoom(draupnir);

      const roomDiscovery = createRoomDiscovery(draupnir);
      const roomTakedownProtection = createRoomTakedownProtection(
        this.lifetime,
        draupnir,
        roomDiscovery,
        [createSynapseHTTPAntispamRoomExplorer(draupnir, roomDiscovery)]
      );

      const policyRoomEditor = (
        await draupnir.policyRoomManager.getPolicyRoomEditor(
          MatrixRoomReference.fromRoomID(policyRoom)
        )
      ).expect("Should be able to get the policy room editor");
      const policyEventID = (
        await policyRoomEditor.takedownEntity(
          PolicyRuleType.Room,
          takedownTargetRoomID,
          { shouldHash: true }
        )
      ).expect("Should be able to takedown the room via a policy list editor");
      const policyEvent = (
        await draupnir.clientPlatform
          .toRoomEventGetter()
          .getEvent(policyRoom, policyEventID)
      ).expect("Should be able to find the policy event");
      const policy = parsePolicyRule(policyEvent as never).expect(
        "Should be able to parse the policy rule"
      );
      (
        await roomTakedownProtection.handlePolicyChange(
          draupnir.protectedRoomsSet.watchedPolicyRooms.currentRevision,
          [
            {
              changeType: PolicyRuleChangeType.Added,
              rule: policy,
              event: policyEvent as never,
              sender: policyEvent.sender,
            },
          ]
        )
      ).expect("Should have been able to handle the policy change");
      // give some time for the room to be takendown, synapse can be quite slow at this...
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const bystander = await newTestUser(this.config.homeserverUrl, {
        name: { contains: "bystander" },
      });
      await bystander.joinRoom(takedownTargetRoomID);
      await new Promise((resolve) => setTimeout(resolve, 1000));
      expect(
        draupnir.stores.roomAuditLog?.isRoomTakendown(takedownTargetRoomID)
      ).toBe(true);
      expect(
        (
          await draupnir.clientPlatform
            .toRoomJoiner()
            .joinRoom(takedownTargetRoomID)
        ).isOkay
      ).toBe(false);
    } as unknown as Mocha.AsyncFunc
  );
});

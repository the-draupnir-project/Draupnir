// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
  MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE,
  MjolnirEnabledProtectionsEventType,
  MjolnirProtectedRoomsEvent,
} from "matrix-protection-suite";
import { Draupnir } from "../../../src/Draupnir";
import {
  StringRoomID,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { isOk } from "@gnuxie/typescript-result";
import { SafeModeDraupnir } from "../../../src/safemode/DraupnirSafeMode";
import { DraupnirRestartError } from "../../../src/safemode/SafeModeToggle";
import { MatrixSendClient } from "matrix-protection-suite-for-matrix-bot-sdk";

async function clobberProtectedRooms(client: MatrixSendClient): Promise<void> {
  const existingAccountData =
    await client.getAccountData<MjolnirProtectedRoomsEvent>(
      MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE
    );
  existingAccountData.rooms.push("clobbered" as StringRoomID);
  await client.setAccountData(
    MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
    existingAccountData
  );
}

async function clobberWatchedLists(client: MatrixSendClient): Promise<void> {
  await client.setAccountData(MJOLNIR_WATCHED_POLICY_ROOMS_EVENT_TYPE, {
    references: "cheese",
  });
}

async function clobberEnabledProtections(
  client: MatrixSendClient
): Promise<void> {
  await client.setAccountData(MjolnirEnabledProtectionsEventType, {
    enabled: 34,
  });
}

async function goToSafeMode(
  sender: StringUserID,
  draupnir: Draupnir
): Promise<SafeModeDraupnir> {
  return (
    await draupnir.sendTextCommand<SafeModeDraupnir>(
      sender,
      "!draupnir safe mode"
    )
  ).expect("Failed to switch to safe mode to setup the test");
}

async function recoverAndRestart(
  sender: StringUserID,
  initialDraupnir: SafeModeDraupnir
): Promise<Draupnir> {
  const badRestartResult = await initialDraupnir.sendTextCommand(
    sender,
    "!draupnir restart"
  );
  if (isOk(badRestartResult)) {
    throw new TypeError(
      "The restat command should have failed because we clobbered account data."
    );
  }
  const safeModeDraupnirWithRecoveryOptions = (() => {
    if (badRestartResult.error instanceof DraupnirRestartError) {
      return badRestartResult.error.safeModeDraupnir;
    } else {
      throw new TypeError("Expected a DraupnirRestartError");
    }
  })();
  (
    await safeModeDraupnirWithRecoveryOptions.sendTextCommand(
      sender,
      "!draupnir recover 1"
    )
  ).expect("Failed to recover the draupnir");
  return (
    await safeModeDraupnirWithRecoveryOptions.sendTextCommand<Draupnir>(
      sender,
      "!draupnir restart"
    )
  ).expect("Failed to restart the draupnir after recovery was attempted");
}

type ClobberEffectDescription = {
  effect: (client: MatrixSendClient) => Promise<void>;
  description: string;
};

export async function testClobberEffect(
  sender: StringUserID,
  initialDraupnir: Draupnir,
  effect: ClobberEffectDescription
): Promise<Draupnir> {
  console.log(`Testing clobber effect: ${effect.description}`);
  const initialSafeModeDraupnir = await goToSafeMode(sender, initialDraupnir);
  await effect.effect(initialSafeModeDraupnir.client);
  return await recoverAndRestart(sender, initialSafeModeDraupnir);
}

async function testAllClobberEffects(
  sender: StringUserID,
  draupnir: Draupnir,
  effects: ClobberEffectDescription[]
): Promise<void> {
  for (const effect of effects) {
    await testClobberEffect(sender, draupnir, effect);
  }
}

export const ClobberEffects = [
  {
    effect: clobberProtectedRooms,
    description: "ProtectedRooms",
  },
  {
    effect: clobberWatchedLists,
    description: "WatchedLists",
  },
  {
    effect: clobberEnabledProtections,
    description: "EnabledProtections",
  },
];

export async function testRecoverAndRestart(
  sender: StringUserID,
  draupnir: Draupnir
): Promise<void> {
  await testAllClobberEffects(sender, draupnir, ClobberEffects);
}

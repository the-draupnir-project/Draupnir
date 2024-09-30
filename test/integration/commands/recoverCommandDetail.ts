// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
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

async function clobberAccountData(draupnir: Draupnir): Promise<void> {
  const existingAccountData =
    await draupnir.client.getAccountData<MjolnirProtectedRoomsEvent>(
      MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE
    );
  existingAccountData.rooms.push("clobbered" as StringRoomID);
  await draupnir.client.setAccountData(
    MJOLNIR_PROTECTED_ROOMS_EVENT_TYPE,
    existingAccountData
  );
}

export async function testRecoverAndRestart(
  sender: StringUserID,
  draupnir: Draupnir
): Promise<void> {
  const initialSafeModeDraupnir = (
    await draupnir.sendTextCommand<SafeModeDraupnir>(
      sender,
      "!draupnir safe mode"
    )
  ).expect("Failed to switch to safe mode to setup the test");
  await clobberAccountData(draupnir);
  const badRestartResult = await initialSafeModeDraupnir.sendTextCommand(
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
  (
    await safeModeDraupnirWithRecoveryOptions.sendTextCommand(
      sender,
      "!draupnir restart"
    )
  ).expect("Failed to restart the draupnir after recovery was attempted");
}

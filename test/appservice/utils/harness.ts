// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import path from "path";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { ensureAliasedRoomExists } from "../../integration/mjolnirSetupUtils";
import {
  read as configRead,
  AppserviceConfig,
} from "../../../src/appservice/config/config";
import { newTestUser } from "../../integration/clientHelper";
import { CreateEvent, MatrixClient } from "matrix-bot-sdk";
import { POLICY_ROOM_TYPE_VARIANTS } from "matrix-protection-suite";
import { isStringRoomAlias } from "@the-draupnir-project/matrix-basic-types";

export function readTestConfig(): AppserviceConfig {
  return configRead(
    path.join(__dirname, "../../../src/appservice/config/config.harness.yaml")
  );
}

export async function setupHarness(): Promise<MjolnirAppService> {
  const config = readTestConfig();
  const utilityUser = await newTestUser(config.homeserver.url, {
    name: { contains: "utility" },
  });
  if (
    typeof config.adminRoom !== "string" ||
    !isStringRoomAlias(config.adminRoom)
  ) {
    throw new TypeError(
      "This test expects the harness config to have a room alias."
    );
  }
  await ensureAliasedRoomExists(utilityUser, config.adminRoom);
  return await MjolnirAppService.run(
    9000,
    config,
    "draupnir-registration.yaml"
  );
}

export async function isPolicyRoom(
  user: MatrixClient,
  roomId: string
): Promise<boolean> {
  const createEvent = new CreateEvent(
    await user.getRoomStateEvent(roomId, "m.room.create", "")
  );
  return POLICY_ROOM_TYPE_VARIANTS.includes(createEvent.type);
}

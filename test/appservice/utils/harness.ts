import path from "path";
import { MjolnirAppService } from "../../../src/appservice/AppService";
import { ensureAliasedRoomExists } from "../../integration/mjolnirSetupUtils";
import {
  read as configRead,
  IConfig,
} from "../../../src/appservice/config/config";
import { newTestUser } from "../../integration/clientHelper";
import { CreateEvent, MatrixClient } from "matrix-bot-sdk";
import { POLICY_ROOM_TYPE_VARIANTS } from "matrix-protection-suite";

export function readTestConfig(): IConfig {
  return configRead(
    path.join(__dirname, "../../../src/appservice/config/config.harness.yaml")
  );
}

export async function setupHarness(): Promise<MjolnirAppService> {
  const config = readTestConfig();
  const utilityUser = await newTestUser(config.homeserver.url, {
    name: { contains: "utility" },
  });
  await ensureAliasedRoomExists(utilityUser, config.adminRoom);
  return await MjolnirAppService.run(9000, config, "mjolnir-registration.yaml");
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

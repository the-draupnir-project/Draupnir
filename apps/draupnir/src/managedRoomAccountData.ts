// SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>
// SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import { isError, Ok, Result, ResultError } from "@gnuxie/typescript-result";
import { Type } from "@sinclair/typebox";
import {
  isStringRoomAlias,
  isStringRoomID,
  isStringUserID,
  MatrixRoomID,
  MatrixRoomReference,
  StringUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  ClientCapabilitiesNegotiation,
  ClientPlatform,
  EDStatic,
  MatrixAccountData,
  RoomCreator,
  RoomIDPermalinkSchema,
  RoomVersionMirror,
} from "matrix-protection-suite";

export const ZERO_TOUCH_DEPLOY_ROOM_ACCOUNT_DATA_TYPE =
  "space.draupnir.zero_touch_deploy_room";

export const ZeroTouchDeployRoomAccountDataSchema = Type.Object({
  room: RoomIDPermalinkSchema,
});

export type ZeroTouchDeployRoomAccountData = EDStatic<
  typeof ZeroTouchDeployRoomAccountDataSchema
>;

export async function loadOrCreateZeroTouchDeployRoom(
  ZTDRoomAccountData: MatrixAccountData<ZeroTouchDeployRoomAccountData>,
  roomCreator: RoomCreator,
  clientCapabilitiesNegotiation: ClientCapabilitiesNegotiation,
  requestingUserID: StringUserID,
  draupnirUserID: StringUserID
): Promise<Result<MatrixRoomID>> {
  const loadResult = await ZTDRoomAccountData.requestAccountData();
  if (isError(loadResult)) {
    return loadResult.elaborate(
      "Unable to load zero touch deploy management room from account data"
    );
  }
  if (loadResult.ok !== undefined) {
    return Ok(loadResult.ok.room);
  }
  return await makeZeroTouchDeployRoom(
    ZTDRoomAccountData,
    roomCreator,
    clientCapabilitiesNegotiation,
    requestingUserID,
    draupnirUserID
  );
}

export async function makeZeroTouchDeployRoom(
  ZTDRoomAccountData: MatrixAccountData<ZeroTouchDeployRoomAccountData>,
  roomCreator: RoomCreator,
  clientCapabilitiesNegotiation: ClientCapabilitiesNegotiation,
  requestingUserID: StringUserID,
  draupnirUserID: StringUserID
): Promise<Result<MatrixRoomID>> {
  const capabilities =
    await clientCapabilitiesNegotiation.getClientCapabilities();
  if (isError(capabilities)) {
    return capabilities.elaborate(
      "Failed to fetch room versions from client capabilities"
    );
  }
  const defaultRoomVersion =
    capabilities.ok.capabilities["m.room_versions"].default;
  if (typeof defaultRoomVersion !== "string") {
    return ResultError.Result(
      "Client capabilities did not contain a valid default room version"
    );
  }
  const isRoomVersionWithPrivilegedCreators =
    RoomVersionMirror.isVersionWithPrivilegedCreators(defaultRoomVersion);
  const roomCreateResult = await roomCreator.createRoom({
    preset: "private_chat",
    invite: [requestingUserID],
    name: `${requestingUserID}'s Draupnir`,
    power_level_content_override: isRoomVersionWithPrivilegedCreators
      ? {
          users: {
            [requestingUserID]: 150,
          },
        }
      : {
          users: {
            [requestingUserID]: 100,
            // Give the draupnir a higher PL so that can avoid issues with managing the management room.
            [draupnirUserID]: 101,
          },
        },
  });
  if (isError(roomCreateResult)) {
    return roomCreateResult.elaborate(
      "Failed to create the zero touch deploy room"
    );
  }
  const storeResult = await ZTDRoomAccountData.storeAccountData({
    room: roomCreateResult.ok,
  });
  if (isError(storeResult)) {
    return storeResult.elaborate(
      "Failed to store the zero touch deploy room account data"
    );
  }
  return roomCreateResult;
}

export async function loadZeroTouchDeployRoomFromConfig(
  configuredZTDRoom: string | undefined,
  configuredInitialManager: string | undefined,
  accountData: MatrixAccountData<ZeroTouchDeployRoomAccountData>,
  clientPlatform: ClientPlatform,
  clientUserID: StringUserID,
  options: {
    allowPermalinkForRoomConfig: boolean;
    configuredRoomPropertyName: string;
    configuredInitialManagerPropertyName: string;
  }
): Promise<Result<MatrixRoomID>> {
  if (configuredZTDRoom === undefined) {
    if (configuredInitialManager === undefined) {
      return ResultError.Result(
        `If ${options.configuredRoomPropertyName} isn't set, you must set an ${options.configuredInitialManagerPropertyName}`
      );
    }
    if (!isStringUserID(configuredInitialManager)) {
      return ResultError.Result(
        `${options.configuredInitialManagerPropertyName} is not a StringUserID`
      );
    }
    return await loadOrCreateZeroTouchDeployRoom(
      accountData,
      clientPlatform.toRoomCreator(),
      clientPlatform.toClientCapabilitiesNegotiation(),
      configuredInitialManager,
      clientUserID
    );
  }
  const configuredZTDRoomReference = (() => {
    if (isStringRoomID(configuredZTDRoom)) {
      return Ok(MatrixRoomReference.fromRoomID(configuredZTDRoom));
    } else if (isStringRoomAlias(configuredZTDRoom)) {
      return Ok(MatrixRoomReference.fromRoomIDOrAlias(configuredZTDRoom));
    } else if (!options.allowPermalinkForRoomConfig) {
      return ResultError.Result(
        `${options.configuredRoomPropertyName}: ${configuredZTDRoom} is not a valid room id or alias`
      );
    } else {
      const parseResult = MatrixRoomReference.fromPermalink(configuredZTDRoom);
      if (isError(parseResult)) {
        return parseResult.elaborate(
          `Failed to parse zero touch deploy permalink from ${options.configuredRoomPropertyName}`
        );
      }
      return parseResult;
    }
  })();
  if (isError(configuredZTDRoomReference)) {
    return configuredZTDRoomReference;
  }
  const ZTDRoomResolveResult = await clientPlatform
    .toRoomResolver()
    .resolveRoom(configuredZTDRoomReference.ok);
  if (isError(ZTDRoomResolveResult)) {
    return ZTDRoomResolveResult.elaborate(
      "Unable to resolve zero touch deploy room"
    );
  }
  const managementRoomJoinResult = await clientPlatform
    .toRoomJoiner()
    .joinRoom(ZTDRoomResolveResult.ok);
  if (isError(managementRoomJoinResult)) {
    return managementRoomJoinResult.elaborate(
      "Unable to join zero touch deploy room"
    );
  }
  return managementRoomJoinResult;
}

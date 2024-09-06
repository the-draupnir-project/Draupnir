// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { Draupnir } from "../Draupnir";
import { isError, Ok, PolicyRuleType } from "matrix-protection-suite";
import { LogLevel } from "matrix-bot-sdk";
import { findPolicyRoomIDFromShortcode } from "./CreateBanListCommand";
import {
  isStringUserID,
  MatrixGlob,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  describeCommand,
  MatrixRoomIDPresentationType,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StringPresentationType,
  tuple,
  union,
} from "@the-draupnir-project/interface-manager";
import { Result } from "@gnuxie/typescript-result";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

async function unbanUserFromRooms(draupnir: Draupnir, rule: MatrixGlob) {
  await draupnir.managementRoomOutput.logMessage(
    LogLevel.INFO,
    "Unban",
    `Unbanning users that match glob: ${rule.regex}`
  );
  for (const revision of draupnir.protectedRoomsSet.setMembership.allRooms) {
    for (const member of revision.members()) {
      if (member.membership !== "ban") {
        continue;
      }
      if (rule.test(member.userID)) {
        await draupnir.managementRoomOutput.logMessage(
          LogLevel.DEBUG,
          "Unban",
          `Unbanning ${member.userID} in ${revision.room.toRoomIDOrAlias()}`,
          revision.room.toRoomIDOrAlias()
        );
        if (!draupnir.config.noop) {
          await draupnir.client.unbanUser(
            member.userID,
            revision.room.toRoomIDOrAlias()
          );
        } else {
          await draupnir.managementRoomOutput.logMessage(
            LogLevel.WARN,
            "Unban",
            `Attempted to unban ${member.userID} in ${revision.room.toRoomIDOrAlias()} but Mjolnir is running in no-op mode`,
            revision.room.toRoomIDOrAlias()
          );
        }
      }
    }
  }
}

export const DraupnirUnbanCommand = describeCommand({
  summary:
    "Removes an entity from a policy list. If the entity is a glob, then the flag --true must be provided to unban users matching the glob from all protected rooms.",
  parameters: tuple(
    {
      name: "entity",
      description:
        "The entity to ban. This can be a user ID, room ID, or server name.",
      acceptor: union(
        MatrixUserIDPresentationType,
        MatrixRoomReferencePresentationSchema,
        StringPresentationType
      ),
    },
    {
      name: "list",
      acceptor: union(
        MatrixRoomReferencePresentationSchema,
        StringPresentationType
      ),
      prompt: async function (draupnir: Draupnir) {
        return Ok({
          suggestions: draupnir.policyRoomManager
            .getEditablePolicyRoomIDs(
              draupnir.clientUserID,
              PolicyRuleType.User
            )
            .map((room) => MatrixRoomIDPresentationType.wrap(room)),
        });
      },
    }
  ),
  keywords: {
    keywordDescriptions: {
      true: {
        isFlag: true,
      },
    },
  },
  async executor(
    draupnir: Draupnir,
    _info,
    keywords,
    _rest,
    entity,
    policyRoomDesignator
  ): Promise<Result<void>> {
    const roomResolver = draupnir.clientPlatform.toRoomResolver();
    const policyRoomReference =
      typeof policyRoomDesignator === "string"
        ? await findPolicyRoomIDFromShortcode(draupnir, policyRoomDesignator)
        : Ok(policyRoomDesignator);
    if (isError(policyRoomReference)) {
      return policyRoomReference;
    }
    const policyRoom = await roomResolver.resolveRoom(policyRoomReference.ok);
    if (isError(policyRoom)) {
      return policyRoom;
    }
    const policyRoomEditor =
      await draupnir.policyRoomManager.getPolicyRoomEditor(policyRoom.ok);
    if (isError(policyRoomEditor)) {
      return policyRoomEditor;
    }
    const policyRoomUnban =
      entity instanceof MatrixUserID
        ? await policyRoomEditor.ok.unbanEntity(
            PolicyRuleType.User,
            entity.toString()
          )
        : typeof entity === "string"
          ? await policyRoomEditor.ok.unbanEntity(PolicyRuleType.Server, entity)
          : await (async () => {
              const bannedRoom = await roomResolver.resolveRoom(entity);
              if (isError(bannedRoom)) {
                return bannedRoom;
              }
              return await policyRoomEditor.ok.unbanEntity(
                PolicyRuleType.Room,
                bannedRoom.ok.toRoomIDOrAlias()
              );
            })();
    if (isError(policyRoomUnban)) {
      return policyRoomUnban;
    }
    if (typeof entity === "string" || entity instanceof MatrixUserID) {
      const rawEnttiy = typeof entity === "string" ? entity : entity.toString();
      const isGlob = (string: string) =>
        string.includes("*") ? true : string.includes("?");
      const rule = new MatrixGlob(entity.toString());
      if (isStringUserID(rawEnttiy)) {
        draupnir.unlistedUserRedactionQueue.removeUser(rawEnttiy);
      }
      if (
        !isGlob(rawEnttiy) ||
        keywords.getKeywordValue<boolean>("true", false)
      ) {
        await unbanUserFromRooms(draupnir, rule);
      } else {
        await draupnir.managementRoomOutput.logMessage(
          LogLevel.WARN,
          "Unban",
          "Running unban without `unban <list> <user> true` will not override existing room level bans"
        );
      }
    }
    return Ok(undefined);
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirUnbanCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

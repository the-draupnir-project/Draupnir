// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import { DraupnirContext } from "./CommandHandler";
import {
  findPresentationType,
  KeywordsDescription,
  parameters,
  ParsedKeywords,
  union,
} from "./interface-manager/ParameterParsing";
import { MatrixGlob, LogLevel } from "matrix-bot-sdk";
import {
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { Draupnir } from "../Draupnir";
import {
  ActionResult,
  isError,
  Ok,
  PolicyRuleType,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { findPolicyRoomIDFromShortcode } from "./CreateBanListCommand";
import {
  isStringUserID,
  MatrixRoomReference,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";

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

async function unban(
  this: DraupnirContext,
  keywords: ParsedKeywords,
  entity: MatrixUserID | MatrixRoomReference | string,
  policyRoomDesignator: MatrixRoomReference | string
): Promise<ActionResult<void>> {
  const policyRoomReference =
    typeof policyRoomDesignator === "string"
      ? await findPolicyRoomIDFromShortcode(this.draupnir, policyRoomDesignator)
      : Ok(policyRoomDesignator);
  if (isError(policyRoomReference)) {
    return policyRoomReference;
  }
  const policyRoom = await resolveRoomReferenceSafe(
    this.client,
    policyRoomReference.ok
  );
  if (isError(policyRoom)) {
    return policyRoom;
  }
  const policyRoomEditor =
    await this.draupnir.policyRoomManager.getPolicyRoomEditor(policyRoom.ok);
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
            const bannedRoom = await resolveRoomReferenceSafe(
              this.client,
              entity
            );
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
      this.draupnir.unlistedUserRedactionQueue.removeUser(rawEnttiy);
    }
    if (
      !isGlob(rawEnttiy) ||
      keywords.getKeyword<string>("true", "false") === "true"
    ) {
      await unbanUserFromRooms(this.draupnir, rule);
    } else {
      await this.draupnir.managementRoomOutput.logMessage(
        LogLevel.WARN,
        "Unban",
        "Running unban without `unban <list> <user> true` will not override existing room level bans"
      );
    }
  }

  return Ok(undefined);
}

defineInterfaceCommand({
  designator: ["unban"],
  table: "draupnir",
  parameters: parameters(
    [
      {
        name: "entity",
        acceptor: union(
          findPresentationType("MatrixUserID"),
          findPresentationType("MatrixRoomReference"),
          findPresentationType("string")
        ),
      },
      {
        name: "list",
        acceptor: union(
          findPresentationType("MatrixRoomReference"),
          findPresentationType("string")
        ),
        prompt: async function (this: DraupnirContext) {
          return {
            suggestions:
              this.draupnir.policyRoomManager.getEditablePolicyRoomIDs(
                this.draupnir.clientUserID,
                PolicyRuleType.User
              ),
          };
        },
      },
    ],
    undefined,
    new KeywordsDescription({
      true: {
        name: "true",
        isFlag: true,
        acceptor: findPresentationType("boolean"),
      },
    })
  ),
  command: unban,
  summary:
    "Removes an entity from a policy list. If the entity is a glob, then the flag --true must be provided to unban users matching the glob from all protected rooms.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "unban"),
  renderer: tickCrossRenderer,
});

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
import {
  ActionResult,
  PolicyRoomEditor,
  PolicyRuleType,
  isError,
  Ok,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { findPolicyRoomIDFromShortcode } from "./CreateBanListCommand";
import {
  MatrixRoomReference,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";
import {
  BasicInvocationInformation,
  MatrixRoomIDPresentationType,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StringPresentationType,
  describeCommand,
  tuple,
  union,
} from "@the-draupnir-project/interface-manager";
import { DraupnirInterfaceAdaptor } from "./DraupnirCommandPrerequisites";

export async function findPolicyRoomEditorFromRoomReference(
  draupnir: Draupnir,
  policyRoomReference: MatrixRoomReference
): Promise<ActionResult<PolicyRoomEditor>> {
  const policyRoomID = await resolveRoomReferenceSafe(
    draupnir.client,
    policyRoomReference
  );
  if (isError(policyRoomID)) {
    return policyRoomID;
  }
  return await draupnir.policyRoomManager.getPolicyRoomEditor(policyRoomID.ok);
}

export const DraupnirBanCommand = describeCommand({
  summary: "Bans an entity from the policy list.",
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
  rest: {
    name: "reason",
    description: "The reason for the ban.",
    acceptor: StringPresentationType,
    prompt: async function (draupnir: Draupnir) {
      return Ok({
        suggestions: draupnir.config.commands.ban.defaultReasons.map(
          (reason) => [StringPresentationType.wrap(reason)]
        ),
      });
    },
  },
  async executor(
    draupnir: Draupnir,
    _info: BasicInvocationInformation,
    _keywords,
    reasonParts,
    entity,
    policyRoomDesignator
  ): Promise<ActionResult<string>> {
    const policyRoomReference =
      typeof policyRoomDesignator === "string"
        ? await findPolicyRoomIDFromShortcode(draupnir, policyRoomDesignator)
        : Ok(policyRoomDesignator);
    if (isError(policyRoomReference)) {
      return policyRoomReference;
    }
    const policyListEditorResult = await findPolicyRoomEditorFromRoomReference(
      draupnir,
      policyRoomReference.ok
    );
    if (isError(policyListEditorResult)) {
      return policyListEditorResult;
    }
    const policyListEditor = policyListEditorResult.ok;
    const reason = reasonParts.join(" ");
    if (entity instanceof MatrixUserID) {
      return await policyListEditor.banEntity(
        PolicyRuleType.User,
        entity.toString(),
        reason
      );
    } else if (typeof entity === "string") {
      return await policyListEditor.banEntity(
        PolicyRuleType.Server,
        entity,
        reason
      );
    } else {
      const resolvedRoomReference = await resolveRoomReferenceSafe(
        draupnir.client,
        entity
      );
      if (isError(resolvedRoomReference)) {
        return resolvedRoomReference;
      }
      return await policyListEditor.banEntity(
        PolicyRuleType.Server,
        resolvedRoomReference.ok.toRoomIDOrAlias(),
        reason
      );
    }
  },
});

DraupnirInterfaceAdaptor.describeRenderer(DraupnirBanCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

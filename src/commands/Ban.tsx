// Copyright 2022 - 2023 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2021 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  ActionResult,
  PolicyRoomEditor,
  PolicyRuleType,
  isError,
  Ok,
  PolicyRoomManager,
  RoomResolver,
  PolicyListConfig,
} from "matrix-protection-suite";
import { findPolicyRoomIDFromShortcode } from "./CreateBanListCommand";
import {
  MatrixRoomReference,
  MatrixUserID,
  StringUserID,
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
import {
  DraupnirContextToCommandContextTranslator,
  DraupnirInterfaceAdaptor,
} from "./DraupnirCommandPrerequisites";

export async function findPolicyRoomEditorFromRoomReference(
  roomResolver: RoomResolver,
  policyRoomManager: PolicyRoomManager,
  policyRoomReference: MatrixRoomReference
): Promise<ActionResult<PolicyRoomEditor>> {
  const policyRoomID = await roomResolver.resolveRoom(policyRoomReference);
  if (isError(policyRoomID)) {
    return policyRoomID;
  }
  return await policyRoomManager.getPolicyRoomEditor(policyRoomID.ok);
}

export type DraupnirBanCommandContext = {
  policyRoomManager: PolicyRoomManager;
  issuerManager: PolicyListConfig;
  defaultReasons: string[];
  roomResolver: RoomResolver;
  clientUserID: StringUserID;
};

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
      prompt: async function ({
        policyRoomManager,
        clientUserID,
      }: DraupnirBanCommandContext) {
        return Ok({
          suggestions: policyRoomManager
            .getEditablePolicyRoomIDs(clientUserID, PolicyRuleType.User)
            .map((room) => MatrixRoomIDPresentationType.wrap(room)),
        });
      },
    }
  ),
  rest: {
    name: "reason",
    description: "The reason for the ban.",
    acceptor: StringPresentationType,
    prompt: async function ({ defaultReasons }: DraupnirBanCommandContext) {
      return Ok({
        suggestions: defaultReasons.map((reason) =>
          StringPresentationType.wrap(reason)
        ),
      });
    },
  },
  async executor(
    {
      issuerManager,
      policyRoomManager,
      roomResolver,
      clientUserID,
    }: DraupnirBanCommandContext,
    _info: BasicInvocationInformation,
    _keywords,
    reasonParts,
    entity,
    policyRoomDesignator
  ): Promise<ActionResult<string>> {
    const policyRoomReference =
      typeof policyRoomDesignator === "string"
        ? await findPolicyRoomIDFromShortcode(
            issuerManager,
            policyRoomManager,
            clientUserID,
            policyRoomDesignator
          )
        : Ok(policyRoomDesignator);
    if (isError(policyRoomReference)) {
      return policyRoomReference;
    }
    const policyListEditorResult = await findPolicyRoomEditorFromRoomReference(
      roomResolver,
      policyRoomManager,
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
      const resolvedRoomReference = await roomResolver.resolveRoom(entity);
      if (isError(resolvedRoomReference)) {
        return resolvedRoomReference;
      }
      return await policyListEditor.banEntity(
        PolicyRuleType.Room,
        resolvedRoomReference.ok.toRoomIDOrAlias(),
        reason
      );
    }
  },
});

DraupnirContextToCommandContextTranslator.registerTranslation(
  DraupnirBanCommand,
  function (draupnir) {
    return {
      policyRoomManager: draupnir.policyRoomManager,
      issuerManager: draupnir.protectedRoomsSet.issuerManager,
      defaultReasons: draupnir.config.commands.ban.defaultReasons,
      roomResolver: draupnir.clientPlatform.toRoomResolver(),
      clientUserID: draupnir.clientUserID,
    };
  }
);

DraupnirInterfaceAdaptor.describeRenderer(DraupnirBanCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
});

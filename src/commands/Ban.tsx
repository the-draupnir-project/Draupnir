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
  defineInterfaceCommand,
  findTableCommand,
} from "./interface-manager/InterfaceCommand";
import {
  findPresentationType,
  ParameterDescription,
  parameters,
  ParsedKeywords,
  RestDescription,
  union,
} from "./interface-manager/ParameterParsing";
import "./interface-manager/MatrixPresentations";
import { defineMatrixInterfaceAdaptor } from "./interface-manager/MatrixInterfaceAdaptor";
import { tickCrossRenderer } from "./interface-manager/MatrixHelpRenderer";
import { PromptOptions } from "./interface-manager/PromptForAccept";
import { Draupnir } from "../Draupnir";
import {
  ActionResult,
  MatrixRoomReference,
  PolicyRoomEditor,
  PolicyRuleType,
  isError,
  UserID,
  Ok,
} from "matrix-protection-suite";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { findPolicyRoomIDFromShortcode } from "./CreateBanListCommand";

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

async function ban(
  this: DraupnirContext,
  _keywords: ParsedKeywords,
  entity: UserID | MatrixRoomReference | string,
  policyRoomDesignator: MatrixRoomReference | string,
  ...reasonParts: string[]
): Promise<ActionResult<string>> {
  const policyRoomReference =
    typeof policyRoomDesignator === "string"
      ? await findPolicyRoomIDFromShortcode(this.draupnir, policyRoomDesignator)
      : Ok(policyRoomDesignator);
  if (isError(policyRoomReference)) {
    return policyRoomReference;
  }
  const policyListEditorResult = await findPolicyRoomEditorFromRoomReference(
    this.draupnir,
    policyRoomReference.ok
  );
  if (isError(policyListEditorResult)) {
    return policyListEditorResult;
  }
  const policyListEditor = policyListEditorResult.ok;
  const reason = reasonParts.join(" ");
  if (entity instanceof UserID) {
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
      this.draupnir.client,
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
}

defineInterfaceCommand({
  designator: ["ban"],
  table: "draupnir",
  parameters: parameters(
    [
      {
        name: "entity",
        acceptor: union(
          findPresentationType("UserID"),
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
        prompt: async function (
          this: DraupnirContext,
          _parameter: ParameterDescription
        ): Promise<PromptOptions> {
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
    new RestDescription<DraupnirContext>(
      "reason",
      findPresentationType("string"),
      async function (_parameter) {
        return {
          suggestions: this.draupnir.config.commands.ban.defaultReasons,
        };
      }
    )
  ),
  command: ban,
  summary: "Bans an entity from the policy list.",
});

defineMatrixInterfaceAdaptor({
  interfaceCommand: findTableCommand("draupnir", "ban"),
  renderer: tickCrossRenderer,
});

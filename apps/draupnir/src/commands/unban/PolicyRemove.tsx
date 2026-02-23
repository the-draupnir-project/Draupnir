// Copyright 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  BasicInvocationInformation,
  DeadDocumentJSX,
  describeCommand,
  MatrixRoomIDPresentationType,
  MatrixRoomReferencePresentationSchema,
  MatrixUserIDPresentationType,
  StringPresentationType,
  tuple,
  union,
} from "@the-draupnir-project/interface-manager";
import { Draupnir } from "../../Draupnir";
import {
  Ok,
  PolicyRule,
  PolicyRuleMatchType,
  PolicyRuleType,
  Recommendation,
  StringTypeResult,
  StringTypeResultBuilder,
} from "matrix-protection-suite";
import { isError, Result, ResultError } from "@gnuxie/typescript-result";
import { findPolicyRoomEditorFromRoomReference } from "../Ban";
import {
  MatrixRoomID,
  MatrixUserID,
  StringEventID,
} from "@the-draupnir-project/matrix-basic-types";
import { DraupnirInterfaceAdaptor } from "../DraupnirCommandPrerequisites";

const RecommendationSpec = Object.freeze({
  ban: "ban",
  takedown: "takedown",
});

function recommendationFromSpec(spec: string): Result<Recommendation> {
  switch (spec) {
    case RecommendationSpec.ban:
      return Ok(Recommendation.Ban);
    case RecommendationSpec.takedown:
      return Ok(Recommendation.Takedown);
    default:
      return ResultError.Result(`Unknown recommendation provided: ${spec}`);
  }
}

function ruleTypeFromEntity(entity: MatrixRoomID | MatrixUserID | string) {
  if (entity instanceof MatrixRoomID) {
    return PolicyRuleType.Room;
  } else if (entity instanceof MatrixUserID) {
    return PolicyRuleType.User;
  } else {
    return PolicyRuleType.Server;
  }
}

type PolicyRemovalPreview = {
  policyRoom: MatrixRoomID;
  recommendation: Recommendation;
  entity: MatrixRoomID | MatrixUserID | string;
  policyType: PolicyRuleType;
  policies: PolicyRule[];
  isPreview: boolean;
  removals: StringTypeResult<StringEventID>;
};

export const DraupnirPolicyRemoveCommand = describeCommand({
  summary:
    "Removes a specific policy from a policy room by using the entity as an exact literal alongside the recommendation to find any relevant policies.\
  This is different to the unban command in that it will not try to find all policies that match the entity.",
  parameters: tuple(
    {
      name: "entity",
      description: "The entity for which the policy exists for",
      acceptor: union(
        MatrixRoomIDPresentationType,
        StringPresentationType,
        MatrixUserIDPresentationType
      ),
    },
    {
      name: "list",
      acceptor: union(
        MatrixRoomReferencePresentationSchema,
        StringPresentationType
      ),
      prompt: async function ({ policyRoomManager, clientUserID }: Draupnir) {
        return Ok({
          suggestions: policyRoomManager
            .getEditablePolicyRoomIDs(clientUserID, PolicyRuleType.User)
            .map((room) => MatrixRoomIDPresentationType.wrap(room)),
        });
      },
    },
    {
      name: "recommendation",
      acceptor: StringPresentationType,
      async prompt() {
        return Ok({
          suggestions: Object.values(RecommendationSpec).map((spec) =>
            StringPresentationType.wrap(spec)
          ),
        });
      },
    }
  ),
  keywords: {
    keywordDescriptions: {
      "no-confirm": {
        isFlag: true,
        description:
          "Runs the command without requiring confirmation or a preview",
      },
    },
  },
  async executor(
    draupnir: Draupnir,
    _info: BasicInvocationInformation,
    keywords,
    _rest,
    entity,
    policyRoomDesignator,
    recommendationSpec
  ): Promise<Result<PolicyRemovalPreview>> {
    const recommendationResult = recommendationFromSpec(recommendationSpec);
    if (isError(recommendationResult)) {
      return recommendationResult;
    }
    const policyRoomReference =
      typeof policyRoomDesignator === "string"
        ? Ok(
            draupnir.protectedRoomsSet.watchedPolicyRooms.findPolicyRoomFromShortcode(
              policyRoomDesignator
            )?.room
          )
        : Ok(policyRoomDesignator);
    if (isError(policyRoomReference)) {
      return policyRoomReference;
    }
    if (policyRoomReference.ok === undefined) {
      return ResultError.Result(
        `Unable to find a policy room from the shortcode ${policyRoomDesignator.toString()}`
      );
    }
    const policyRoomEditor = await findPolicyRoomEditorFromRoomReference(
      draupnir.clientPlatform.toRoomResolver(),
      draupnir.policyRoomManager,
      policyRoomReference.ok
    );
    if (isError(policyRoomEditor)) {
      return policyRoomEditor.elaborate(
        "Unable to get an editor for the provided policy room reference"
      );
    }
    const policyRoomRevisionIssuer =
      await draupnir.policyRoomManager.getPolicyRoomRevisionIssuer(
        policyRoomEditor.ok.room
      );
    if (isError(policyRoomRevisionIssuer)) {
      return policyRoomRevisionIssuer;
    }
    const policiesToRemove = policyRoomRevisionIssuer.ok.currentRevision
      .allRulesMatchingEntity(entity.toString(), {
        recommendation: recommendationResult.ok,
        type: ruleTypeFromEntity(entity),
        searchHashedRules: true,
      })
      .filter((rule) =>
        rule.matchType === PolicyRuleMatchType.Glob
          ? rule.entity === entity.toString()
          : true
      );
    const isPreview = !keywords.getKeywordValue<boolean>("no-confirm", false);
    const removalsBuilder = new StringTypeResultBuilder<StringEventID>();
    if (!isPreview) {
      for (const policy of policiesToRemove) {
        const removalResult = await policyRoomEditor.ok.removePolicyByStateKey(
          ruleTypeFromEntity(entity),
          policy.sourceEvent.state_key
        );
        removalsBuilder.addResult(policy.sourceEvent.event_id, removalResult);
      }
    }
    return Ok({
      policies: policiesToRemove,
      entity,
      policyRoom: policyRoomEditor.ok.room,
      recommendation: recommendationResult.ok,
      policyType: ruleTypeFromEntity(entity),
      isPreview,
      removals: removalsBuilder.getResult(),
    });
  },
});

function renderPolicyRemovalPolicy(policy: PolicyRule) {
  // We intentionally include the type from the source event for the situation
  // where policies of legacy types get removed.
  return (
    <li>
      <ul>
        <code>sender</code>: <code>{policy.sourceEvent.sender}</code>
      </ul>
      <ul>
        <code>reason</code>:{" "}
        {policy.reason === undefined ? (
          <span>no reason was supplied</span>
        ) : (
          <code>{policy.reason}</code>
        )}
      </ul>
      <ul>
        <code>type</code>: <code>{policy.sourceEvent.type}</code>
      </ul>
      <ul>
        <code>event_id</code>: <code>{policy.sourceEvent.event_id}</code>
      </ul>
      <ul>
        <code>state_key</code>: <code>{policy.sourceEvent.state_key}</code>
      </ul>
    </li>
  );
}

function renderPreview(preview: PolicyRemovalPreview) {
  return (
    <root>
      <h4>
        The following policies{" "}
        {preview.isPreview ? "will be removed" : "have been removed"} that
        contain the literal <code>{preview.entity.toString()}</code> for the
        policy type <code>{preview.policyType}</code> and recommendation{" "}
        <code>{preview.recommendation}</code>:
      </h4>
      <ul>{preview.policies.map(renderPolicyRemovalPolicy)}</ul>
    </root>
  );
}

DraupnirInterfaceAdaptor.describeRenderer(DraupnirPolicyRemoveCommand, {
  isAlwaysSupposedToUseDefaultRenderer: true,
  JSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return Ok(renderPreview(commandResult.ok));
  },
  confirmationPromptJSXRenderer(commandResult) {
    if (isError(commandResult)) {
      return Ok(undefined);
    }
    return Ok(renderPreview(commandResult.ok));
  },
});

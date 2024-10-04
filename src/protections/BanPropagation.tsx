// Copyright 2022 - 2024 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>
import { DeadDocumentJSX } from "@the-draupnir-project/interface-manager";
import {
  renderMentionPill,
  renderRoomPill,
} from "../commands/interface-manager/MatrixHelpRenderer";
import { ListMatches, renderListRules } from "../commands/Rules";
import { printActionResult } from "../models/RoomUpdateError";
import {
  AbstractProtection,
  ActionResult,
  Logger,
  MembershipChange,
  MembershipChangeType,
  Ok,
  PermissionError,
  PolicyRule,
  PolicyRuleType,
  ProtectedRoomsSet,
  ProtectionDescription,
  Recommendation,
  RoomActionError,
  RoomMembershipRevision,
  RoomUpdateError,
  Task,
  describeProtection,
  isError,
  UnknownSettings,
  UserConsequences,
  Membership,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DraupnirProtection } from "./Protection";
import { listInfo } from "../commands/StatusCommand";
import { MatrixReactionHandler } from "../commands/interface-manager/MatrixReactionHandler";
import {
  MatrixRoomID,
  StringRoomID,
  MatrixRoomReference,
  StringUserID,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { sendMatrixEventsFromDeadDocument } from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";

const log = new Logger("BanPropagationProtection");

const BAN_PROPAGATION_PROMPT_LISTENER =
  "ge.applied-langua.ge.draupnir.ban_propagation";
const UNBAN_PROPAGATION_PROMPT_LISTENER =
  "ge.applied-langua.ge.draupnir.unban_propagation";

// FIXME: https://github.com/the-draupnir-project/Draupnir/issues/160
function makePolicyRoomReactionReferenceMap(
  rooms: MatrixRoomID[]
): Map<string, string> {
  return MatrixReactionHandler.createItemizedReactionMap(
    rooms.map((room) => room.toPermalink())
  );
}

// would be nice to be able to use presentation types here idk.
interface BanPropagationMessageContext {
  target: string;
  reason?: string;
}

/**
 * Prompt the management room to propagate a user ban to a policy list of their choice.
 * @param mjolnir Draupnir.
 * @param event The ban event.
 * @param roomId The room that the ban happened in.
 * @returns An event id which can be used by the `PromptResponseListener`.
 */
async function promptBanPropagation(
  draupnir: Draupnir,
  change: MembershipChange
): Promise<void> {
  const editablePolicyRoomIDs =
    draupnir.policyRoomManager.getEditablePolicyRoomIDs(
      draupnir.clientUserID,
      PolicyRuleType.User
    );
  const reactionMap = makePolicyRoomReactionReferenceMap(editablePolicyRoomIDs);
  const promptSendResult = await sendMatrixEventsFromDeadDocument(
    draupnir.clientPlatform.toRoomMessageSender(),
    draupnir.managementRoomID,
    <root>
      The user{" "}
      {renderMentionPill(
        change.userID,
        change.content.displayname ?? change.userID
      )}{" "}
      was banned in{" "}
      <a href={`https://matrix.to/#/${change.roomID}`}>{change.roomID}</a> by{" "}
      {renderMentionPill(change.sender, change.sender)} for{" "}
      <code>{change.content.reason ?? "<no reason supplied>"}</code>.<br />
      Would you like to add the ban to a policy list?
      <ol>
        {editablePolicyRoomIDs.map((room) => (
          <li>
            <a href={room.toPermalink()}>{room.toRoomIDOrAlias()}</a>
          </li>
        ))}
      </ol>
    </root>,
    {
      additionalContent: draupnir.reactionHandler.createAnnotation(
        BAN_PROPAGATION_PROMPT_LISTENER,
        reactionMap,
        {
          target: change.userID,
          reason: change.content.reason,
        }
      ),
    }
  );
  if (isError(promptSendResult)) {
    log.error(
      `Could not send the prompt to the management room for the ban in ${change.roomID} for the user ${change.userID}`,
      promptSendResult.error
    );
    return;
  }
  await draupnir.reactionHandler.addReactionsToEvent(
    draupnir.client,
    draupnir.managementRoomID,
    promptSendResult.ok[0] as string,
    reactionMap
  );
}

async function promptUnbanPropagation(
  draupnir: Draupnir,
  membershipChange: MembershipChange,
  roomID: StringRoomID,
  rulesMatchingUser: ListMatches[]
): Promise<void> {
  const reactionMap = new Map<string, string>(
    Object.entries({ "unban from all": "unban from all" })
  );
  const promptSendResult = await sendMatrixEventsFromDeadDocument(
    draupnir.clientPlatform.toRoomMessageSender(),
    draupnir.managementRoomID,
    <root>
      The user{" "}
      {renderMentionPill(
        membershipChange.userID,
        membershipChange.content.displayname ?? membershipChange.userID
      )}{" "}
      was unbanned from the room{" "}
      {renderRoomPill(MatrixRoomReference.fromRoomID(roomID))} by{" "}
      {membershipChange.sender} for{" "}
      <code>{membershipChange.content.reason ?? "<no reason supplied>"}</code>
      .<br />
      However there are rules in Draupnir's watched lists matching this user:
      <ul>
        {rulesMatchingUser.map((match) => (
          <li>{renderListRules(match)}</li>
        ))}
      </ul>
      Would you like to remove these rules and unban the user from all protected
      rooms?
    </root>,
    {
      additionalContent: draupnir.reactionHandler.createAnnotation(
        UNBAN_PROPAGATION_PROMPT_LISTENER,
        reactionMap,
        {
          target: membershipChange.userID,
          reason: membershipChange.content.reason,
        }
      ),
    }
  );
  if (isError(promptSendResult)) {
    log.error(
      `Could not send the prompt to the management room for the unban in ${roomID} for the user ${membershipChange.userID}`,
      promptSendResult.error
    );
    return;
  }
  await draupnir.reactionHandler.addReactionsToEvent(
    draupnir.client,
    draupnir.managementRoomID,
    promptSendResult.ok[0] as string,
    reactionMap
  );
}

export type BanPropagationProtectionCapabilities = {
  userConsequences: UserConsequences;
};

export type BanPropagationProtectionCapabilitiesDescription =
  ProtectionDescription<
    Draupnir,
    UnknownSettings<string>,
    BanPropagationProtectionCapabilities
  >;

export class BanPropagationProtection
  extends AbstractProtection<BanPropagationProtectionCapabilitiesDescription>
  implements
    DraupnirProtection<BanPropagationProtectionCapabilitiesDescription>
{
  private readonly userConsequences: UserConsequences;

  private readonly banPropagationPromptListener =
    this.banReactionListener.bind(this);
  private readonly unbanPropagationPromptListener =
    this.unbanUserReactionListener.bind(this);
  constructor(
    description: BanPropagationProtectionCapabilitiesDescription,
    capabilities: BanPropagationProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.userConsequences = capabilities.userConsequences;
    this.draupnir.reactionHandler.on(
      BAN_PROPAGATION_PROMPT_LISTENER,
      this.banPropagationPromptListener
    );
    this.draupnir.reactionHandler.on(
      UNBAN_PROPAGATION_PROMPT_LISTENER,
      this.unbanPropagationPromptListener
    );
  }

  handleProtectionDisable(): void {
    this.draupnir.reactionHandler.off(
      BAN_PROPAGATION_PROMPT_LISTENER,
      this.banPropagationPromptListener
    );
    this.draupnir.reactionHandler.off(
      UNBAN_PROPAGATION_PROMPT_LISTENER,
      this.unbanPropagationPromptListener
    );
  }

  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    // use Membership and not MembershipChangeType so that we can detect edits to ban reasons.
    const bans = changes.filter(
      (change) =>
        change.membership === Membership.Ban &&
        change.sender !== this.protectedRoomsSet.userID
    );
    const unbans = changes.filter(
      (change) =>
        change.membershipChangeType === MembershipChangeType.Unbanned &&
        change.sender !== this.protectedRoomsSet.userID
    );
    for (const ban of bans) {
      this.handleBan(ban);
    }
    for (const unban of unbans) {
      void Task(this.handleUnban(unban, this.draupnir));
    }
    return Ok(undefined);
  }

  private handleBan(change: MembershipChange): void {
    const policyRevision =
      this.protectedRoomsSet.issuerManager.policyListRevisionIssuer
        .currentRevision;
    const rulesMatchingUser = policyRevision.allRulesMatchingEntity(
      change.userID,
      PolicyRuleType.User,
      Recommendation.Ban
    );
    if (rulesMatchingUser.length > 0) {
      return; // user is already banned.
    }
    void Task(promptBanPropagation(this.draupnir, change));
  }

  private async handleUnban(
    change: MembershipChange,
    draupnir: Draupnir
  ): Promise<void> {
    const policyRevision =
      this.protectedRoomsSet.issuerManager.policyListRevisionIssuer
        .currentRevision;
    const rulesMatchingUser = policyRevision.allRulesMatchingEntity(
      change.userID,
      PolicyRuleType.User,
      Recommendation.Ban
    );
    const policyRoomInfo = await listInfo(
      draupnir.protectedRoomsSet.issuerManager,
      draupnir.policyRoomManager
    );
    if (rulesMatchingUser.length === 0) {
      return; // user is already unbanned.
    }
    const addRule = (
      map: Map<StringRoomID, PolicyRule[]>,
      rule: PolicyRule
    ) => {
      const listRoomID = rule.sourceEvent.room_id;
      const entry =
        map.get(listRoomID) ??
        ((newEntry) => (map.set(listRoomID, newEntry), newEntry))([]);
      entry.push(rule);
      return map;
    };
    const rulesByPolicyRoom = rulesMatchingUser.reduce(
      (map, rule) => addRule(map, rule),
      new Map<StringRoomID, PolicyRule[]>()
    );
    await promptUnbanPropagation(
      this.draupnir,
      change,
      change.roomID,
      [...rulesByPolicyRoom.entries()].map(([policyRoomID, rules]) => {
        const info = policyRoomInfo.find(
          (i) => i.revision.room.toRoomIDOrAlias() === policyRoomID
        );
        if (info === undefined) {
          throw new TypeError(
            `Shouldn't be possible to have a rule from an unwatched list.`
          );
        }
        return {
          room: info.revision.room,
          roomID: policyRoomID,
          matches: rules,
          profile: info.watchedListProfile,
        };
      })
    );
  }

  private async banReactionListener(
    key: string,
    item: unknown,
    context: BanPropagationMessageContext
  ) {
    if (typeof item === "string") {
      const policyRoomRef = MatrixRoomReference.fromPermalink(item);
      if (isError(policyRoomRef)) {
        log.error(
          `Could not parse the room reference for the policy list to ban a user within ${item}`,
          policyRoomRef.error,
          context
        );
        return;
      }
      const roomID = await resolveRoomReferenceSafe(
        this.draupnir.client,
        policyRoomRef.ok
      );
      if (isError(roomID)) {
        log.error(
          `Could not resolve the room reference for the policy list to ban a user within ${policyRoomRef.ok.toPermalink()}`,
          roomID.error
        );
        return;
      }
      const listResult =
        await this.draupnir.policyRoomManager.getPolicyRoomEditor(roomID.ok);
      if (isError(listResult)) {
        log.error(
          `Could not find a policy list for the policy room ${policyRoomRef.ok.toPermalink()}`,
          listResult.error
        );
        return;
      }
      const banResult = await listResult.ok.banEntity(
        PolicyRuleType.User,
        context.target,
        context.reason
      );
      if (isError(banResult)) {
        log.error(
          `Could not ban a user ${context.target} from the list ${policyRoomRef.ok.toPermalink()}`,
          banResult.error
        );
      }
    } else {
      log.error(`The Ban Result map has been malformed somehow item:`, item);
    }
  }

  private async unbanUserReactionListener(
    key: string,
    item: unknown,
    context: BanPropagationMessageContext
  ): Promise<void> {
    if (item === "unban from all") {
      // FIXME:
      // the unban from lists code should be moved to a standard consequence.
      const errors: RoomUpdateError[] = [];
      const policyRevision =
        this.protectedRoomsSet.issuerManager.policyListRevisionIssuer
          .currentRevision;
      const rulesMatchingUser = policyRevision.allRulesMatchingEntity(
        context.target,
        PolicyRuleType.User,
        Recommendation.Ban
      );
      const listsWithRules = new Set<StringRoomID>(
        rulesMatchingUser.map((rule) => rule.sourceEvent.room_id)
      );
      const editablePolicyRooms =
        this.draupnir.policyRoomManager.getEditablePolicyRoomIDs(
          this.draupnir.clientUserID,
          PolicyRuleType.User
        );
      for (const roomIDWithPolicy of listsWithRules) {
        const editablePolicyRoom = editablePolicyRooms.find(
          (room) => room.toRoomIDOrAlias() === roomIDWithPolicy
        );
        if (editablePolicyRoom === undefined) {
          const roomID = MatrixRoomReference.fromRoomID(roomIDWithPolicy, [
            userServerName(this.draupnir.clientUserID),
          ]);
          errors.push(
            new PermissionError(
              roomID,
              `${this.draupnir.clientUserID} doesn't have the power level to remove the policy banning ${context.target} within ${roomID.toPermalink()}`
            )
          );
          continue;
        }
        const editorResult =
          await this.draupnir.policyRoomManager.getPolicyRoomEditor(
            editablePolicyRoom
          );
        if (isError(editorResult)) {
          errors.push(
            RoomActionError.fromActionError(
              editablePolicyRoom,
              editorResult.error
            )
          );
          continue;
        }
        const editor = editorResult.ok;
        const unbanResult = await editor.unbanEntity(
          PolicyRuleType.User,
          context.target
        );
        if (isError(unbanResult)) {
          errors.push(
            RoomActionError.fromActionError(
              editablePolicyRoom,
              unbanResult.error
            )
          );
          continue;
        }
      }
      if (errors.length > 0) {
        void Task(
          printActionResult(
            this.draupnir.clientPlatform.toRoomMessageSender(),
            this.draupnir.managementRoomID,
            errors,
            {
              title: `There were errors unbanning ${context.target} from all lists.`,
            }
          )
        );
      } else {
        void Task(
          (async () => {
            await this.userConsequences.unbanUserFromRoomSet(
              context.target as StringUserID,
              "<no reason supplied>"
            );
          })()
        );
      }
    } else {
      log.error(
        `unban reaction map is malformed got item for key ${key}:`,
        item
      );
    }
  }
}

describeProtection<BanPropagationProtectionCapabilities, Draupnir>({
  name: "BanPropagationProtection",
  description:
    "When you ban a user in any protected room with a client, this protection\
    will turn the room level ban into a policy for a policy list of your choice.\
    This will then allow the bot to ban the user from all of your rooms.",
  capabilityInterfaces: {
    userConsequences: "UserConsequences",
  },
  defaultCapabilities: {
    userConsequences: "StandardUserConsequences",
  },
  factory: (decription, protectedRoomsSet, draupnir, capabilities, _settings) =>
    Ok(
      new BanPropagationProtection(
        decription,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    ),
});

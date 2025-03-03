// Copyright 2022 - 2025 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2019 - 2022 The Matrix.org Foundation C.I.C.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>
import {
  DeadDocumentJSX,
  DocumentNode,
} from "@the-draupnir-project/interface-manager";
import {
  renderMentionPill,
  renderRoomPill,
} from "../commands/interface-manager/MatrixHelpRenderer";
import {
  AbstractProtection,
  ActionResult,
  Logger,
  MembershipChange,
  MembershipChangeType,
  Ok,
  PolicyRuleType,
  ProtectedRoomsSet,
  ProtectionDescription,
  Recommendation,
  RoomMembershipRevision,
  Task,
  describeProtection,
  isError,
  UserConsequences,
  Membership,
  UnknownConfig,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import { resolveRoomReferenceSafe } from "matrix-protection-suite-for-matrix-bot-sdk";
import { DraupnirProtection } from "./Protection";
import { MatrixReactionHandler } from "../commands/interface-manager/MatrixReactionHandler";
import {
  MatrixRoomID,
  StringRoomID,
  MatrixRoomReference,
  MatrixUserID,
} from "@the-draupnir-project/matrix-basic-types";
import { sendMatrixEventsFromDeadDocument } from "../commands/interface-manager/MPSMatrixInterfaceAdaptor";
import { sendConfirmationPrompt } from "../commands/interface-manager/MatrixPromptForConfirmation";
import {
  UnbanMembersPreview,
  renderUnbanMembersPreview,
} from "../commands/unban/Unban";
import { findUnbanInformationForMember } from "../commands/unban/UnbanUsers";

const log = new Logger("BanPropagationProtection");

const BAN_PROPAGATION_PROMPT_LISTENER =
  "ge.applied-langua.ge.draupnir.ban_propagation";

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

function renderUnbanPrompt(
  membershipChange: MembershipChange,
  roomID: StringRoomID,
  unbanPreview: UnbanMembersPreview
): DocumentNode {
  return (
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
      <br />
      Would you like to remove these rules and unban the user from all protected
      rooms?
      {renderUnbanMembersPreview(unbanPreview)}
    </root>
  );
}

async function promptUnbanPropagation(
  draupnir: Draupnir,
  membershipChange: MembershipChange,
  roomID: StringRoomID
): Promise<void> {
  const unbanPreview = findUnbanInformationForMember(
    draupnir.protectedRoomsSet.setRoomMembership,
    new MatrixUserID(membershipChange.userID),
    draupnir.protectedRoomsSet.watchedPolicyRooms,
    { inviteMembers: false }
  );
  const promptSendResult = await sendConfirmationPrompt(
    draupnir,
    {
      commandDesignator: ["draupnir", "unban"],
      readItems: [membershipChange.userID],
    },
    renderUnbanPrompt(membershipChange, roomID, unbanPreview),
    { roomID: draupnir.managementRoomID }
  );
  if (isError(promptSendResult)) {
    log.error(
      `Could not send the prompt to the management room for the unban in ${roomID} for the user ${membershipChange.userID}`,
      promptSendResult.error
    );
    return;
  }
}

export type BanPropagationProtectionCapabilities = {
  userConsequences: UserConsequences;
};

export type BanPropagationProtectionCapabilitiesDescription =
  ProtectionDescription<
    Draupnir,
    UnknownConfig,
    BanPropagationProtectionCapabilities
  >;

export class BanPropagationProtection
  extends AbstractProtection<BanPropagationProtectionCapabilitiesDescription>
  implements DraupnirProtection<BanPropagationProtectionCapabilitiesDescription>
{
  private readonly banPropagationPromptListener =
    this.banReactionListener.bind(this);
  constructor(
    description: BanPropagationProtectionCapabilitiesDescription,
    capabilities: BanPropagationProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.draupnir.reactionHandler.on(
      BAN_PROPAGATION_PROMPT_LISTENER,
      this.banPropagationPromptListener
    );
  }

  handleProtectionDisable(): void {
    this.draupnir.reactionHandler.off(
      BAN_PROPAGATION_PROMPT_LISTENER,
      this.banPropagationPromptListener
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
      void Task(this.handleUnban(unban));
    }
    return Ok(undefined);
  }

  private handleBan(change: MembershipChange): void {
    const policyRevision =
      this.protectedRoomsSet.watchedPolicyRooms.currentRevision;
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

  private async handleUnban(change: MembershipChange): Promise<void> {
    await promptUnbanPropagation(this.draupnir, change, change.roomID);
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

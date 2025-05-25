// SPDX-FileCopyrightText: 2025 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: AFL-3.0

import {
  AbstractProtection,
  describeProtection,
  Logger,
  PolicyRuleType,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  Recommendation,
  UnknownConfig,
  WatchedPolicyRooms,
} from "matrix-protection-suite";
import { BlockingCallback } from "../webapis/SynapseHTTPAntispam/SpamCheckEndpointPluginManager";
import { UserMayInviteListenerArguments } from "../webapis/SynapseHTTPAntispam/UserMayInviteEndpoint";
import { createHash } from "crypto";
import {
  MatrixGlob,
  userServerName,
} from "@the-draupnir-project/matrix-basic-types";
import { SynapseHttpAntispam } from "../webapis/SynapseHTTPAntispam/SynapseHttpAntispam";
import { Draupnir } from "../Draupnir";
import { Ok, ResultError } from "@gnuxie/typescript-result";

const log = new Logger("SynapseHTTPUserMayInvite");

export class SynapseHTTPUserMayInvite {
  private readonly synapseHTTPCallback = (
    function (this: SynapseHTTPUserMayInvite, { inviter: sender, room_id }) {
      const userHash = createHash("sha256")
        .update(sender, "utf8")
        .digest("base64");
      const serverHash = createHash("sha256")
        .update(userServerName(sender), "utf8")
        .digest("base64");
      // We only want to block the invitation with user policies with recommendation Ban
      // when they match the automaticRedactReasons. This is so they can still appeal
      // being banned in COC use cases.
      // Server policies are fine to be used to derive the block.
      const matchingUserPolicy = [
        ...this.watchedPolicyRooms.currentRevision.allRulesMatchingEntity(
          sender,
          {}
        ),
        ...this.watchedPolicyRooms.currentRevision.findRulesMatchingHash(
          userHash,
          "sha256",
          { type: PolicyRuleType.User }
        ),
      ].find(
        (policy) =>
          policy.recommendation === Recommendation.Takedown ||
          (policy.recommendation === Recommendation.Ban &&
            this.automaticRedactionReasons.some((reason) =>
              reason.test(policy.reason ?? "<no reason supplied>")
            ))
      );
      const matchingServerOrRoomPolicy = [
        ...this.watchedPolicyRooms.currentRevision.allRulesMatchingEntity(
          userServerName(sender),
          {}
        ),
        ...this.watchedPolicyRooms.currentRevision.findRulesMatchingHash(
          serverHash,
          "sha256",
          { type: PolicyRuleType.Server }
        ),
        ...this.watchedPolicyRooms.currentRevision.allRulesMatchingEntity(
          room_id,
          {}
        ),
      ].find(
        (policy) =>
          policy.recommendation === Recommendation.Takedown ||
          policy.recommendation === Recommendation.Ban
      );
      if (
        matchingUserPolicy !== undefined ||
        matchingServerOrRoomPolicy !== undefined
      ) {
        log.debug(
          `Blocking an invitation from ${sender}`,
          matchingServerOrRoomPolicy
        );
        return Promise.resolve({
          errcode: "M_FORBIDDEN",
          error: "You are not allowed to send invitations to this homeserver",
        });
      } else {
        return Promise.resolve("NOT_SPAM");
      }
    } satisfies BlockingCallback<UserMayInviteListenerArguments>
  ).bind(this);

  private automaticRedactionReasons: MatrixGlob[] = [];
  public constructor(
    private readonly watchedPolicyRooms: WatchedPolicyRooms,
    automaticallyRedactForReasons: string[],
    private readonly synapseHTTPAntispam: SynapseHttpAntispam
  ) {
    for (const reason of automaticallyRedactForReasons) {
      this.automaticRedactionReasons.push(new MatrixGlob(reason.toLowerCase()));
    }
    synapseHTTPAntispam.userMayInviteHandles.registerBlockingHandle(
      this.synapseHTTPCallback
    );
  }

  unregisterListeners(): void {
    this.synapseHTTPAntispam.userMayInviteHandles.unregisterHandle(
      this.synapseHTTPCallback
    );
  }
}

type BlockInvitationsOnServerProtectionCapabilities = Record<never, never>;

type BlockInvitationsOnServerProtectionDescription = ProtectionDescription<
  Draupnir,
  UnknownConfig,
  BlockInvitationsOnServerProtectionCapabilities
>;

export class BlockInvitationsOnServerProtection
  extends AbstractProtection<BlockInvitationsOnServerProtectionDescription>
  implements Protection<BlockInvitationsOnServerProtectionDescription>
{
  private readonly userMayInvite: SynapseHTTPUserMayInvite;
  public constructor(
    description: BlockInvitationsOnServerProtectionDescription,
    capabilities: BlockInvitationsOnServerProtectionCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    automaticallyRedactForReasons: string[],
    synapseHTTPAntispam: SynapseHttpAntispam
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.userMayInvite = new SynapseHTTPUserMayInvite(
      protectedRoomsSet.watchedPolicyRooms,
      automaticallyRedactForReasons,
      synapseHTTPAntispam
    );
  }

  handleProtectionDisable(): void {
    this.userMayInvite.unregisterListeners();
  }
}

describeProtection<BlockInvitationsOnServerProtectionCapabilities, Draupnir>({
  name: BlockInvitationsOnServerProtection.name,
  description:
    "Blocks invitations from users marked as takedown or have bans matching the the configured automaticallyRedactForReasons",
  capabilityInterfaces: {},
  defaultCapabilities: {},
  factory(description, protectedRoomsSet, draupnir, capabilities, _settings) {
    if (draupnir.synapseHTTPAntispam === undefined) {
      return ResultError.Result(
        "This protection requires synapse-http-antispam to be enabled"
      );
    }
    return Ok(
      new BlockInvitationsOnServerProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir.config.automaticallyRedactForReasons,
        draupnir.synapseHTTPAntispam
      )
    );
  },
});

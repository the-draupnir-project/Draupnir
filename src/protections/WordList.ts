// Copyright 2022 Gnuxie <Gnuxie@protonmail.com>
// Copyright 2020 Emi Tatsuo Simpson et al.
//
// SPDX-License-Identifier: AFL-3.0 AND Apache-2.0
//
// SPDX-FileAttributionText: <text>
// This modified file incorporates work from mjolnir
// https://github.com/matrix-org/mjolnir
// </text>

import {
  AbstractProtection,
  ActionResult,
  EventConsequences,
  EventWithMixins,
  ExtensibleTextMixinDescription,
  Logger,
  MembershipChange,
  MembershipChangeType,
  Ok,
  ProtectedRoomsSet,
  Protection,
  ProtectionDescription,
  RoomMembershipRevision,
  RoomMessageBodyMixinDescription,
  RoomMessageFormattedBodyMixinDescription,
  Task,
  UnknownConfig,
  UserConsequences,
  describeProtection,
  isError,
} from "matrix-protection-suite";
import { Draupnir } from "../Draupnir";
import {
  StringUserID,
  StringRoomID,
  MatrixRoomID,
} from "@the-draupnir-project/matrix-basic-types";
import { resultifyBotSDKRequestError } from "matrix-protection-suite-for-matrix-bot-sdk";

const log = new Logger("WordList");

type WordListCapabilities = {
  userConsequences: UserConsequences;
  eventConsequences: EventConsequences;
};

type WordListSettings = UnknownConfig;

type WordListDescription = ProtectionDescription<
  Draupnir,
  WordListSettings,
  WordListCapabilities
>;

describeProtection<WordListCapabilities, Draupnir>({
  name: "WordListProtection",
  description:
    "If a user posts a monitored word a set amount of time after joining, they\
    will be banned from that room.  This will not publish the ban to a ban list.\
    This protection only targets recently joined users.",
  capabilityInterfaces: {
    userConsequences: "UserConsequences",
    eventConsequences: "EventConsequences",
  },
  defaultCapabilities: {
    userConsequences: "StandardUserConsequences",
    eventConsequences: "StandardEventConsequences",
  },
  factory: async function (
    description,
    protectedRoomsSet,
    draupnir,
    capabilities,
    _settings
  ) {
    return Ok(
      new WordListProtection(
        description,
        capabilities,
        protectedRoomsSet,
        draupnir
      )
    );
  },
});

type JustJoinedUsers = Map<StringUserID, Date>;
type JustJoinedByRoom = Map<StringRoomID, JustJoinedUsers>;

export class WordListProtection
  extends AbstractProtection<WordListDescription>
  implements Protection<WordListDescription>
{
  private justJoined: JustJoinedByRoom = new Map();
  private badWords: RegExp;

  private readonly userConsequences: UserConsequences;
  private readonly eventConsequences: EventConsequences;
  constructor(
    description: WordListDescription,
    capabilities: WordListCapabilities,
    protectedRoomsSet: ProtectedRoomsSet,
    private readonly draupnir: Draupnir
  ) {
    super(description, capabilities, protectedRoomsSet, {});
    this.userConsequences = capabilities.userConsequences;
    this.eventConsequences = capabilities.eventConsequences;
    // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#escaping
    const escapeRegExp = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };
    // Create a mega-regex from all the tiny words.
    const words = this.draupnir.config.protections.wordlist.words
      .filter((word) => word.length !== 0)
      .map(escapeRegExp);
    this.badWords = new RegExp(words.join("|"), "i");
  }
  public async handleMembershipChange(
    revision: RoomMembershipRevision,
    changes: MembershipChange[]
  ): Promise<ActionResult<void>> {
    const roomID = revision.room.toRoomIDOrAlias();
    const minsBeforeTrusting =
      this.draupnir.config.protections.wordlist.minutesBeforeTrusting;
    if (minsBeforeTrusting > 0) {
      for (const change of changes) {
        const entryForRoom =
          this.justJoined.get(roomID) ??
          ((entry) => (this.justJoined.set(roomID, entry), entry))(new Map());
        // When a new member logs in, store the time they joined.  This will be useful
        // when we need to check if a message was sent within 20 minutes of joining
        if (change.membershipChangeType === MembershipChangeType.Joined) {
          const now = new Date();
          entryForRoom.set(change.userID, now);
          log.debug(
            `${change.userID} joined ${roomID} at ${now.toDateString()}`
          );
        } else if (
          change.membershipChangeType === MembershipChangeType.Left ||
          change.membershipChangeType === MembershipChangeType.Banned ||
          change.membershipChangeType === MembershipChangeType.Kicked
        ) {
          entryForRoom.delete(change.userID);
        }
      }
    }
    return Ok(undefined);
  }

  public handleTimelineEventMixins(
    room: MatrixRoomID,
    event: EventWithMixins
  ): void {
    // If the sender is draupnir, ignore the message
    if (event.sourceEvent["sender"] === this.draupnir.clientUserID) {
      log.debug(`Ignoring message from self: ${event.sourceEvent.event_id}`);
      return;
    }
    const bodies = [
      ((mixin) => (mixin?.isErroneous === true ? undefined : mixin?.body))(
        event.findMixin(RoomMessageBodyMixinDescription)
      ),
      ((mixin) => (mixin?.isErroneous ? undefined : mixin?.formatted_body))(
        event.findMixin(RoomMessageFormattedBodyMixinDescription)
      ),
      ...(((mixin) =>
        mixin?.isErroneous
          ? undefined
          : mixin?.representations.map(
              (representation) => representation.body
            ))(event.findMixin(ExtensibleTextMixinDescription)) ?? []),
    ].filter((mixin) => mixin !== undefined);
    if (bodies.length === 0) {
      return;
    }
    const minsBeforeTrusting =
      this.draupnir.config.protections.wordlist.minutesBeforeTrusting;
    const roomID = room.toRoomIDOrAlias();
    // Check conditions first
    if (minsBeforeTrusting > 0) {
      const roomEntry = this.justJoined.get(roomID);
      const joinTime = roomEntry?.get(event.sourceEvent["sender"]);
      if (joinTime !== undefined) {
        // Disregard if the user isn't recently joined

        // Check if they did join recently, was it within the timeframe
        const now = new Date();
        if (
          now.valueOf() - joinTime.valueOf() >
          minsBeforeTrusting * 60 * 1000
        ) {
          roomEntry?.delete(event.sourceEvent["sender"]); // Remove the user
          log.info(
            `${event.sourceEvent["sender"]} is no longer considered suspect`
          );
          return;
        }
      } else {
        // The user isn't in the recently joined users list, no need to keep
        // looking
        return;
      }
    }
    const match = bodies.find((body) => this.badWords.exec(body));
    if (!match) {
      return;
    }
    const reason = `Said a bad word. Moderators, consult the management room for more information.`;
    void Task(
      (async () => {
        await this.userConsequences.consequenceForUserInRoom(
          roomID,
          event.sourceEvent.sender,
          reason
        );
        const messageResult = await this.draupnir.client
          .sendMessage(this.draupnir.managementRoomID, {
            msgtype: "m.notice",
            body: `Banned ${event.sourceEvent.sender} in ${roomID} for saying '${match[0]}'.`,
          })
          .then((_) => Ok(undefined), resultifyBotSDKRequestError);
        if (isError(messageResult)) {
          log.error(
            `Failed to send a message to the management room after banning ${event.sourceEvent.sender} in ${roomID} for saying '${match[0]}'.`,
            messageResult.error
          );
        }
        await this.eventConsequences.consequenceForEvent(
          roomID,
          event.sourceEvent.event_id,
          reason
        );
      })(),
      {
        log,
      }
    );
  }
}

<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Changelog

All notable changes to Draupnir will be kept in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v2.6.1] - 2025-08-14

### Fixed

- Policy room creation is now possible on servers where room version 12 is the
  default. Thanks to @Woefdram for reporting.

- Calculation of protection permissions has been fixed in V12 rooms.

## [v2.6.0] - 2025-08-12

### Advice on the hydra disclosure

do not upgrade rooms until the following conditions have been met:

1. You are using Draupnir v2.5.1 or above (you should really wait until the next
   release though).
2. You have considered that not every user in your room will be able to follow
   the tombstone, because their own server has not upgraded yet. This could lead
   to them NEVER following the tombstone when the room becomes dead/lost to
   history
3. You are confident that you know what you are doing. The upgrade UX on Matrix
   is poor and you are likely to dos your own community in a worse way than an
   exploiter of any supposed vulnerability.

See https://matrix.org/docs/communities/administration/#room-upgrades for
current advice on upgrading rooms. We are adding features to Draupnir to make
room upgrades easier for users. See
https://github.com/the-draupnir-project/planning/issues/44.

### Added

- Replacement rooms will automatically be protected when protected rooms are
  upgraded.

### Fixed

- V12 room identifiers can now be used in commands. Thanks to @cremesk for
  reporting.

### Changed

- Room discovery has been made a synchronous part of the takedown command. This
  would happen in background before which could cause confusion if it failed.

## [v2.5.1] - 2025-08-06

This is a small release that makes Draupnir compatible with V12 rooms. Please
update your Draupnir now. We do not recommend anyone upgrade their rooms to V12
unless they have to. See
https://marewolf.me/posts/draupnir/25/do-not-upgrade-to-v12.html . We are
working on features that will make room upgrades very easy for Draupnir users.
See https://github.com/the-draupnir-project/planning/issues/44.

### Fixed

- Draupnir can now join and interact with V12 rooms.

- If you are a Draupnir for all / appservice administrator and your homesever
  sets the default room version to 12, new Draupnir will be able to be
  provisioned.

- The error logging when the config for `acceptInvitesFromSpace` is incorrect
  has been improved.

## [v2.5.0] - 2025-07-08

### Added

- There is a new protection enabled by default called the
  `InvalidEventProtection`. This protection redacts events that contain
  malformed
  [mixins](https://github.com/matrix-org/matrix-spec-proposals/blob/main/proposals/1767-extensible-events.md#mixins-specifically-allowed)
  that are likely to trip up other Matrix clients, or potentially represent an
  attempt to bypass Draupnir protections. For Matrix developers, what qualifies
  as a malformed mixin is very conservative, and we only focus on the core
  properties of a given mixin.

- The `WordListProtection`, and `MentionLimitProtection` are updated to use a
  new method of parsing Matrix events by extracting
  [mixins](https://github.com/matrix-org/matrix-spec-proposals/blob/main/proposals/1767-extensible-events.md#mixins-specifically-allowed)
  that is provided by the matrix-protection-suite. This will allow these
  protections to continue to function should extensible events ever make it into
  a release of the Matrix specification. And generally this is a more robust way
  of parsing Matrix events.

### Fixed

- Draupnir deployed in appservice mode were not being disposed of correctly when
  being placed into or restarting from safe mode. This could be a root cause a
  variety of issues.

### Changed

- The JSON reviver used by Draupnir for handling http requests and responses has
  been modified to cover more property names found on the `Object.prototype`, in
  addition to the existing restrictions preventing prototype pollution. This
  adds redundancy to code handling objects parsed from untrusted sources.

## [v2.4.1] - 2025-06-23

### Fixed

- Fixed an issue where protection config values were not validated or
  substituted with default values when protections were loaded. This effected
  the `RoomTakedownProtection` as described in
  https://github.com/the-draupnir-project/Draupnir/issues/911 reported by
  @FSG-Cat.

## [v2.4.0] - 2025-06-23

### Added

- Implemented `/ping` for
  [synapse-http-antispam](https://the-draupnir-project.github.io/draupnir-documentation/bot/synapse-http-antispam).
  It is now possible to check if synapse is misconfigured by searching for
  `Successfully pinged antispam server with request ID` in any worker log.

- It is now possible to configure the _symbol prefix_ (by default `!`) used for
  Draupnir commands by @FSG-Cat.

- The `RoomTakedownProtection` now sources rooms from the Synapse admin API
  aswell as synapse-http-antispam.

### Changed

- Room discovery notifications are now disabled by default. This is because if
  enabled initially, they are likely to flood your management room with room
  details that you will never go through.

### Fixed

- Bringing Draupnir into safe mode would not disable and dispose of enabled
  protections.

## [v2.3.1] - 2025-05-29

### Fixed

- `RoomTakedownProtection` would fail to creat a notification room if it the
  homeserver at any point failed to invite remote users. We invite users to the
  room separately.

- `RoomTakedownProtection` would invite non joined members of the mangagement
  room to the newly created notification room. Including left and banned users.

## [v2.3.0] - 2025-05-29

This update stabilizes several features for
[homeserver administrators](https://the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration)
that were developed in the
[v2.3.0-beta](https://github.com/the-draupnir-project/Draupnir/blob/main/CHANGELOG.md#v230-beta0)
programme.

Please see
[homeserver administration](https://the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration)
in the documentation for an overview of server admin features.

### Highlights

- Support for
  [synapse-http-antispam](https://the-draupnir-project.github.io/draupnir-documentation/bot/synapse-http-antispam)
  to replace the legacy Mjolnir antispam module.
- [Autosuspension](https://the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration#homeserver-user-policy-protection)
  for resident users matching watched policy rules.
- Takedowns as an alternative to conventional bans. `takedown` marks users,
  rooms, or servers with a policy that means any content associated with the
  entity should be removed and takendown. This is a much stronger consequence
  than `ban` and is reserved for illegal or intolerable content. See
  [MSC4204](https://github.com/matrix-org/matrix-spec-proposals/pull/4204) for
  details. This command works in conjunction with the new
  [_Room Takedown Protection_](https://the-draupnir-project.github.io/draupnir-documentation/protections/room-takedown-protection)
- There is now a generic page for the
  [homeserver administrative](https://the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration)
  features we have added to Draupnir. Please try them out and give us your
  thoughts in [#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org).
- You can now search in the documentation thanks to @FSG-Cat.
- The
  [mention limit protection](https://the-draupnir-project.github.io/draupnir-documentation/protections/mention-limit-protection)
  has been stabilised.

### Added

- `--http-antispam-authorization-path` option by @TheArcaneBrony to allow
  loading the synapse-http-antispam authorization token from a file on systems
  using systemd credentials.

- Booleans and quoted strings are now supported by the command reader. Thanks to
  @mtippmann and @ll-SKY-ll.

- A `policy remove` command has been added to remove policies by literal without
  unbanning users or any other consequences.

### Changed

- The `MentionLimitProtection` has been stabilised and configuration settings
  have been added. The old experimental version of the protection was using a
  file based configuration that is no longer used. The protection will now warn
  users and the ban.

- The `shutdown room` command has been improved so that the content violation
  notification can be toggled with a new `--notify` option. The command also now
  uses V1 of the delete rooms API rather than V2 simply because for unknown
  reasons clients are not getting the leave events propagated to them properly
  with V2.

- The room discovery notifications from the `RoomTakedownProtection` have been
  moved to their own room.

### Fixed

- The `ServerBanSynchronisation` is smarter about applying ACL's when there are
  lots of policy changes.
- Typo in the `protections show` command fixed by @HarHarLinks.
- Typo in `HomeserverUserPolicyProtection` fixed by @ll-SKY-ll.
- Negative integers can now be entered into the markdown reader.
- Fixed an issue where draupnir would write MSC4205 hashed entities without the
  proper namespacing. Reported by @deepbluev7.
- Stopped content violation notifications appearing on room takedown.

### Special thanks

Thanks to @Mikaela @nexy7574 @tulir @FSG-Cat @MTRNord @enbea @ll-SKY-ll
@cdesnoai for their contributions in the 2.3.0-beta that have made this release
possible.

## [v2.3.0-beta.2]

### Fixed

- `!draupnir deactivate <user id> --no-confirm` was backwards.

- `--purge-messages` on user deactivation was broken.

Apologies, normally we'd have integration tests for this but we are time limited
at the moment.

## [v2.3.0-beta.1]

### Added

- A new protection has been added to automatically suspend resident users
  matching policies from Draupnir's watched lists
  (`HomeserverUserPolicyProtection`). If the policies match
  `automaticallyRedactForReasons` then the management will also be prompted for
  a purging deactivation to remove the user's messages.

- `!draupnir deactivate <user id>` now prompts for confirmation and has a
  `--purge-messages` option, which will restrict the user's account while all of
  their messages are redacted.

- `!draupnir unrestrict <user id>` command that will unsuspend / unshadowban the
  user's account.

- `!draupnir suspend <user id>` command that uses the synapse admin API to
  suspend users.

### Changed

- The _Redaction Synchronisation Protection_ has been improved in a few ways:
  - Invitations in protected rooms will be rejected as part of the redaction
    process when they are sent from users being redacted (e.g. as a brigading
    tactic).
  - User redaction will now be triggered on bans and the reason will be scanned
    for `automaticallyRedactForReasons` from Draupnir's config.

### Fixed

- The Draupnir bot itself is now excluded from the MentionLimitProtection thanks
  to @nexy7574 in https://github.com/the-draupnir-project/Draupnir/pull/815.

- MessageIsMediaProtection now correctly checks for noop thanks to @FSG-Cat in
  https://github.com/the-draupnir-project/Draupnir/pull/807.

- Redactions are now ignored in BasicFloodingProtection thanks to @nexy7574 in
  https://github.com/the-draupnir-project/Draupnir/pull/805

- @FSG-Cat has changed some more mentions of Mjolnir to Draupnir in
  https://github.com/the-draupnir-project/Draupnir/pull/796.

## [v2.3.0-beta.0]

In this update we want feedback on new
[homeserver administrative](https://the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration)
features we have added to Draupnir. Please try them out and give us your
thoughts in [#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org).

### Added

- New server administrative features have been added to Draupnir. For an
  overview see
  [homeserver administration](https://the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration)
  in our documentation.

- A new
  [_Room Takedown Protection_](https://the-draupnir-project.github.io/draupnir-documentation/protections/room-takedown-protection)
  has been added to assist homeserver administrators in managing the rooms their
  server is joined to. This includes a room discovery utility where Draupnir
  will notify the management room with details of rooms it has discovered on the
  homeserver (configurable with a threshold for joined members). The intent of
  this protection is to keep rooms with intolerable or illegal content off of
  the homeserver, including invitations to these rooms. Room takedown is backed
  up by policy list support. Added by @Gnuxie and @enbea.

- A new
  [_Block invitations on server protection_](https://the-draupnir-project.github.io/draupnir-documentation/protections/block-invitations-on-server-protection)
  to assist homeserver administrators in preemptively blocking invitations from
  users or rooms listed in Draupnir's watched policy rooms. This replaces the
  functionality in the legacy Mjolnir antispam module and is compatible with
  Synapse workers.

- A new `takedown` command has been added as an alternative to the ban command.
  `takedown` marks users, rooms, or servers with a policy that means any content
  associated with the entity should be removed and takendown. This is a much
  stronger consequence than `ban` and is reserved for illegal or intolerable
  content. See
  [MSC4204](https://github.com/matrix-org/matrix-spec-proposals/pull/4204) for
  details. This command works in conjunction with the new
  [_Room Takedown Protection_](https://the-draupnir-project.github.io/draupnir-documentation/protections/room-takedown-protection)

- Support has been added for
  [MSC4205: Hashed moderation policy entities](https://github.com/matrix-org/matrix-spec-proposals/pull/4205).
  Currently we only support revealing hashed entities for rooms. Except from in
  the
  [_Block invitations on server protection_](https://the-draupnir-project.github.io/draupnir-documentation/protections/block-invitations-on-server-protection).
  The `takedown` command will hash entities by default. These policies require
  your Draupnir (or homeserver) to have encountered a user, room, or server
  before it can reveal the moderation policy. This stops policy rooms from
  becoming an address book for abuse.

- Support for [synapse-http-antispam](https://github.com/maunium/synapse-http-)
  antispam has been added to Draupnir and protections. Thanks to @tulir.

- Room state backing store can now be used in the appservice deployment mode.
  Contributed by @MTRNord in
  [#753](https://github.com/the-draupnir-project/Draupnir/pull/753).

- An experimental protection to stop excess membership changes. This protection
  will send a warning before kicking users that are changing their membership
  event frequently. All of which can be configured.

- A schema has been added to the appservice config file to prevent simple
  mistakes.

### Fixed

- An issue with the `RoomStateBackingStore` for users on docker with read-only
  containers where SQLite temporary files couldn't be created. Reported by
  @cdesnoai and @TheArcaneBrony in
  [#746](https://github.com/the-draupnir-project/Draupnir/issues/746). Fixed by
  @enbea.

- An issue where errors from appservice startup would not propagate to the top
  level.

- Old config properties have been removed from default.yaml thanks to
  @ll-SKY-ll.

- Typo in BasicFloodingProtection thanks to @Mikaela.

## [v2.2.0] - 2025-03-03

### Changed

- ⚠️ **The unban command no longer accepts a list argument**. The unban command
  now features a preview and confirmation prompt unless the `--no-confirm`
  option is provided. This preview shows all the policies that will have to be
  removed to unban a user, all the rooms they will need to be unbanned from, and
  any rooms that they will be invited to if the `--invite` option is used.
  Accepting the prompt will then unban the user or entity from all watched lists
  and all protected rooms.
  ![image](https://github.com/user-attachments/assets/93ac16b1-048d-406e-84c9-6d628c2dd190)

- The unban prompt in the ban propagation protection now includes a preview of
  which rules will be removed and which rooms the user will be unbanned from.

- `!draupnir protections show` now merges protection setting documentation and
  current values into one section.
  ![image](https://github.com/user-attachments/assets/26bcc16b-f85b-4639-9b8f-43f820158c7e)

- Compatible capability providers are shown for the capability set in the
  `!draupnir protections show` command.
  ![image](https://github.com/user-attachments/assets/24c1040c-54df-4895-b8b7-37d261254bf9)

- `!draupnir rooms` now shows a date alongside each room for when the room state
  revision was last updated. The room layout has been changed to show which
  rooms are protected, joined, and also show watched lists.

### Added

- Simulated capabilities for all available protection capabilities. These allow
  protections to run without effects.

- A command `!draupnir protections capability reset <protection name>` to
  restore the default capability set.

- A `!draupnir rules matching members` command has been added to show all policy
  rules that match members to protected rooms.

### Fixed

- Improved logging for unknown errors (see
  [#733](https://github.com/the-draupnir-project/Draupnir/issues/733)).

- The unban command no longer reinvites users by default.

- Improve error handling in parts of the _room state backing store_. Reported by
  @TheArcaneBrony. We are still trying to investigate what is causing the errors
  in the first place in
  [#691](https://github.com/the-draupnir-project/Draupnir/issues/691) and need
  help.

- Fixed a bug where Draupnir would reply with a very hard to understand error
  message to commands that had provided an extra argument.

### Special thanks

Special thanks to all contributors who helped in this release: @daedric7,
@FSG-Cat, @JokerGermany, @ll-SKY-ll, @mahdi1234, @MTRNord, and @TheArcaneBrony

## [v2.1.0] - 2025-02-02

### Fixed

- `config.protectAllJoinedRooms` was unimplemented in versions `v2.0.2` and
  below. This went under the radar in the beta programme because it would have
  only been detectable for first time testers migrating over. Reported by
  @cremesk and @HReflex.

- Draupnir will now automatically unprotect rooms when the bot is kicked, and
  send an alert to the management room.

- `config.commands.allowNoPrefix` will include the full command arguments again.
  Reported by @JacksonChen666 and @heftig in
  https://github.com/the-draupnir-project/Draupnir/issues/707.

- Fixed an issue where the `ProtectedRoomsSet` would not be disposed on entering
  safe mode via the `!draupnir safe mode` command. This would cause duplicate
  protections to apply out of date policies to protected rooms. Reported by
  @TheArcaneBrony in
  https://github.com/the-draupnir-project/Draupnir/issues/687.

- An issue where sometimes Draupnir would crash if it were unable to fetch its
  own profile from the homeserver. We just fallback to nothing if this was the
  case https://github.com/the-draupnir-project/Draupnir/issues/703. Reported by
  @JokerGermany i think.

### Added

- `RoomSetBehaviourProtection` to add the
  `config.protectAllJoinedRoomsFunctionality`. This is also responsible for
  unprotecting rooms as the bot is removed from them.

- The `!draupnir rooms` command will now distinguish between joined and
  protected rooms, joined but unprotected rooms, and protected but parted rooms.

Thank you to everyone who has been promptly reporting bugs and making these
fixes possible <3

## [v2.0.2] 2025-01-24

### Added

- The unban command now has an `--invite` option to re-invite any users that are
  unbanned by the command. By @nexy7574 in
  https://github.com/the-draupnir-project/Draupnir/pull/666.

### Fixed

- Draupnir will now refresh the room state cache in the background after startup
  when the backing store is in use. Fixed by @Gnuxie.

- Fixed issues where the bot wouldn't respond to pings from some SchildiChat,
  Element Web, and Element X. Reported by @Cknight70 in
  https://github.com/the-draupnir-project/Draupnir/issues/686. Fixed by @Gnuxie
  in https://github.com/the-draupnir-project/Draupnir/pull/699

- Fixed an issue where Draupnir would ignore the `Retry-After` http header and
  so not rate limit Draupnir properly. Reported and fixed by @nexy7574 in
  https://github.com/the-draupnir-project/Draupnir/pull/694.

- Draupnir will respond when the `allowNoPrefix` config option is used. Reported
  by @JacksonChen666 in
  https://github.com/the-draupnir-project/Draupnir/issues/678. Fixed by @Gnuxie
  in https://github.com/the-draupnir-project/Draupnir/pull/699.

- Draupnir will now ignore newlines in secret files, previously Draupnir was
  appending the newline to the secrets. Reported and fixed by @TheArcaneBrony in
  https://github.com/the-draupnir-project/Draupnir/pull/696.

## [v2.0.1] 2025-01-18

### Fixed

- Fixed an issue where the `!draupnir unban` and the unban prompt actually
  banned users again at the room level instead of unbanning them. Matching
  policy rules were still removed. This bug was introduced in
  [v2.0.0-beta.5](https://github.com/the-draupnir-project/Draupnir/releases/tag/v2.0.0-beta.5).
  Thanks to @nexy7574 for helping to debug the issue.

- Fixed an issue where default protections would be renabled on restart if
  disabled, thanks to @ll-SKY-ll and @mahdi1234 for helping with debugging this.

## [v2.0.0] 2025-01-16

### Upgrade Steps

There are no manual upgrade steps, the new protections are automatically
enabled. The only thing you should note is that Draupnir now enables the new
`roomStateBackingStore` by default. This improves the startup time of Draupnir
considerably but if you need to disable it, see the config documentation
[here](https://github.com/the-draupnir-project/Draupnir/blob/69b666e56d89472c05175685267b333a7ab988fe/config/default.yaml#L186-L192).

There are also no upgrade steps to upgrading to v2.0.0 from Mjolnir.

Please see the
[documentation](https://the-draupnir-project.github.io/draupnir-documentation/)
if you are installing Draupnir for the first time.

### What's changed

TL;DR everything is so much better.

- Draupnir is now much less dependant on commands and will automatically send
  prompts to the management room. Prompts are sent for inviting Draupnir to
  protect rooms, watch policy lists, banning users, and unbanning users.

- Draupnir is much more responsive. Draupnir now does not need to request any
  data from the homeserver before applying new bans or to ban new users.

- Draupnir now uses a persistent revision system for room state, members,
  policies, and policy matches. By using revisions, Draupnir only has to process
  room state once in terms of simple deltas as room state is updated.

- Draupnir offers a
  [room state backing store](https://github.com/the-draupnir-project/Draupnir/blob/69b666e56d89472c05175685267b333a7ab988fe/config/default.yaml#L186-L192),
  allowing Draupnir to startup quickly, even when deployed at distance from the
  homeserver.

- Protection messages have been revised to present information more efficiently
  in the management room.

- A safe mode has been introduced that can be used to recover Draupnir in
  situations where watched lists or protected rooms become unjoinable.

- All commands now use the new command-oriented
  [interface-manager](https://github.com/the-draupnir-project/interface-manager).

- Protection settings have been reworked. The `!draupnir protections show`
  command now shows all configurable settings for a given protection and
  describes how they can be modified.

In addition to hundreds of other significant fixes, UX improvements, and other
changes that would be too detailed to list in this changelog. For a full list of
changes, please review the
[CHANGELOG](https://github.com/the-draupnir-project/Draupnir/blob/main/CHANGELOG.md#v200-beta11-2025-01-16).

Special thanks to all contributors who helped in the beta programme: @avdb13,
@bluesomewhere, @daedric7, @deepbluev7, @FSG-Cat, @HarHarLinks,
@guillaumechauvat, @jimmackenzie, @jjj333-p, @JokerGermany, @julianfoad,
@Kladki, @ll-SKY-ll, @mahdi1234, @Mikaela, @morguildir, @MTRNord, @nexy7574,
@Philantrop, @ShadowJonathan, @tcpipuk, @TheArcaneBrony

## [v2.0.0-beta.11] 2025-01-16

### Changed

- Enable the room state backing store by default. This is configured with the
  `roomStateBackingStore` setting in config. by @FSG-Cat.

### Fixed

- Fix the report poller so that it no longer repeatedly sends the same reports.

- `WordListProtection`: No longer send the banned word in the banned reason, by
  @nexy7574 in https://github.com/the-draupnir-project/Draupnir/pull/665.

- Fixed the reporter field in the abuse report UX displaying as the sender when
  the report came from the report poller. Reported by @HarHarLinks in
  https://github.com/the-draupnir-project/Draupnir/issues/408.

- Show invalid settings with red crosses in `!draupnir protections show`.

### Added

- The number of unique matrix users in the protected rooms set is now shown in
  the status command as "protected users" .

- `!draupnir protections config reset` command to restore the default protection
  settings for a protection.

### Removed

- Several unused config options have been removed from the template.
  `fasterMembershipChecks` no longer does anything or is needed.
  `confirmWildcardBan` is not used. `protectedRooms` config option is not used
  anymore because it has confusing semantics. by @FSG-Cat.

## [v2.0.0-beta.10] 2025-01-09

### Changed

- Make the unban command's `--true` option the default behaviour. Removing a
  policy will automatically matching unban users from protected rooms. Changed
  by @nexy7574 and reported in
  https://github.com/the-draupnir-project/Draupnir/issues/648

### Fixed

- Stop the kick command from removing members who had left or were banned, Fixed
  and reported by @nexy7574 in
  https://github.com/the-draupnir-project/Draupnir/issues/649.

- Stop room's being added as server policies. Fixed by @nexy7574 reported by
  @FSG-Cat in https://github.com/the-draupnir-project/Draupnir/issues/458.

- Stop Draupnir's `WordList` and `BasicFlooding` protections from reacting to
  itself in the management room. Fixed by @nexy7574 reported by @TheArcaneBrony
  in https://github.com/the-draupnir-project/Draupnir/issues/579.

- Stop duplicate notice's that Draupnir is updating room ACL in
  https://github.com/the-draupnir-project/Draupnir/issues/450.

- Fixed serverACL's were not immediately updated after unwatching or watching a
  new policy list. https://github.com/the-draupnir-project/Draupnir/issues/451.

- Fixed an issue where remote aliases couldn't be resolved unless the homeserver
  was already present in the room. Reported by @TheArcaneBrony in
  https://github.com/the-draupnir-project/Draupnir/issues/460.

- Fixed an issue where it was not possible to unwatch a policy room. Reported by
  @JokerGermany in https://github.com/the-draupnir-project/Draupnir/issues/431,
  and @nexy7574 in https://github.com/the-draupnir-project/Draupnir/issues/647.

- Fixed an issue where if Draupnir was protecting a very large number of users
  then CPU could be starved for as long as a minute while matching users against
  policies. Reported by @TheArcaneBrony in
  https://github.com/the-draupnir-project/Draupnir/issues/498.

- Handle invalid forwarded reports properly. Reported by @Philantrop in
  https://github.com/the-draupnir-project/Draupnir/issues/643.

## [v2.0.0-beta.9] 2024-12-14

### Fixed

- The `!draupnir protections config <protection> <set/add/remove> <value>`
  commands are now working again. A tutorial has been written explaining how to
  use these commands
  https://the-draupnir-project.github.io/draupnir-documentation/protections/configuring-protections.
  Reviewed by @FSG-Cat.

- The `BanPropagationProtection` now shows a prompt for all unbans, even when
  there is no matching rule. This is to make it easier to unban a user from all
  the rooms draupnir is protecting, and not just when removing policy rules.
  Reported by @mahdi1234 in
  https://github.com/the-draupnir-project/Draupnir/issues/622.

- The `JoinWaveShortCircuitProtection` has been improved:

  - The `JoinWaveShortCircuitProtection` now uses a leaky bucket token
    algorithm, prior to this the entire bucket got dumped after a preconfigured
    time.
  - The status command for the protection has returned and will show how full
    each bucket is.

- A bug where providing a bad or missing argument could render the help hint
  poorly or crash draupnir has been fixed.
  https://github.com/the-draupnir-project/Draupnir/issues/642.

### Added

- A new `!draupnir protections show <protection>` command that can display all
  of the settings and capability providers for a protection.

- A new command
  `!draupnir protections capability <capability name> <provider name>` to
  configure a protection's active capabilitity providers. This is experimental
  and is intended to be used in conjunction with the
  `!draupnir protections show <protection>` command. It's not clear whether we
  will demonstrate protection capabilities before or after the upcoming `2.0.0`
  release.

### Special thanks

Special thanks to @TheArcaneBrony, @ll-SKY-ll, @MTRNord, and @daedric7 for
providing support to myself and others in
[#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org).

## [v2.0.0-beta.8] - 2024-10-22

### Changed

- **Breaking**: The Node version required to run Draupnir has been updated from
  Node 18 to Node 20. If you are using Debian, please follow our documentation
  for using Debian and node source
  [here](https://the-draupnir-project.github.io/draupnir-documentation/bot/setup_debian),
  kindly contributed by @ll-SKY-ll. This is due to of the release policy of one
  of our major dependencies, matrix-appservice-bridge, by @MTRNord in
  https://github.com/the-draupnir-project/Draupnir/pull/609. We did this as part
  of larger work to attempt to fix issues with Element's "invisible crypto"
  documented in https://github.com/the-draupnir-project/Draupnir/issues/608.

- The Dockerfile now uses a multi-stage build, so `docker build` will just work
  again. Thanks to @ShadowJonathan for reporting. We also optimized the image
  size just slightly. Long term we've been blocked on for years on
  https://github.com/matrix-org/matrix-rust-sdk-crypto-nodejs/issues/19 which
  would allow us to use the alpine image and take the size down to under 200MB
  again. So if anyone can help out there it'll make a massive difference and be
  greatly appreciated.

- `Dockerfile`: entry-point was renamed from `mjolnir-entrypoint.sh` to
  `draupnir-entrypoint.sh`. If you have built a Dockerfile based on ours, you
  may need to make some changes.

- `Dockerfile`: source code was moved from `/mjolnir` to `/draupnir`. If you
  have built a custom docker image based on our Dockerfile based on ours, you
  may need to make some changes.

- The appservice registration file generator no longer emits
  `mjolnir-registration.yaml` as it has been renamed to
  `draupnir-registration.yaml`. This is only a concern if you have automated
  tooling that generates a registration file.

- The safe mode recovery command now prompts for confirmation.

- Some references to `Mjolnir` have been changed to `Draupnir` thanks to
  @FSG-Cat in https://github.com/the-draupnir-project/Draupnir/pull/591.

#### Development

- Enable `proseWrap` in prettier, by @Mikaela in
  https://github.com/the-draupnir-project/Draupnir/pull/605. We thought that
  this was enabled already but turns out we missed it.

- The `no-confirm` keyword argument now has special meaning, see the safe mode
  recover
  [command](https://github.com/the-draupnir-project/Draupnir/blob/164434d528311f7ba68c1ced7b902a3d118c65f7/src/safemode/commands/RecoverCommand.tsx#L44-L47)
  and
  [renderer](https://github.com/the-draupnir-project/Draupnir/blob/164434d528311f7ba68c1ced7b902a3d118c65f7/src/safemode/commands/RecoverCommand.tsx#L102-L114)
  description for an example.

### Added

- Safe mode now shows a preview of the persistent configs, including the
  property or item that is causing Draupnir to fail to start. Special thanks for
  the feedback from @jimmackenzie and @TheArcaneBrony. Thanks to @julianfoad for
  documenting the use case for safe mode.

- Draupnir now logs at startup the path used to load its configuration file, and
  which options are used for loading secrets. We also show any non-default
  configuration values if Draupnir crashes. This is to to try make it very clear
  to system administrators which configuration options are being used by
  Draupnir and help them diagnose startup issues.

### Deprecated

- Starting Draupnir without the `--draupnir-config` option will cause a
  deprecation warning.

### Removed

- The spurious warnings about not being able to find a config file when the
  `--draupnir-config` option was used have been been removed.

- The documentation for the `WordListProtection` in the configuration file
  claimed that regexes where supported when this wasn't the case. Removed by
  @FSG-Cat in https://github.com/the-draupnir-project/Draupnir/pull/600. We will
  rewrite this protection entirely at a later date.

### Fixed

- Fixed a bug where sometimes the help command wouldn't show if `--keyword` or
  options were used in an unrecognized command.

## Versions v2.0.0-beta.7 and prior

Please see [Releases](https://github.com/the-draupnir-project/Draupnir/releases)
for more information.

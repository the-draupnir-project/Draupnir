<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Changelog

All notable changes to Draupnir will be kept in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - None

## [v2.0.0-beta.10] 2024-01-09

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

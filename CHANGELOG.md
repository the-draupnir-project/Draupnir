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

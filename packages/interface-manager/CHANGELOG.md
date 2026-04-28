<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: Apache-2.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.2.6] - 2025-11-12

### Fixed

- Fix unsafe keyword argument parsing.

## [4.2.5] - 2025-08-12

### Fixed

- Updated matrix-basic-types peer dependency for V12 room ID's.

## [4.2.4] - 2025-08-12

### Fixed

- The `TextCommandReader` can now read V12 room ID's.

- The mention detection regex has been simplified.

## [4.2.3] - 2025-05-31

### Fixed

- The prepare step was changed to postinstall by a misunderstanding.

## [4.2.2] - 2025-05-31

### Fixed

- `@gnuxie/typescript-result` was locally linked in package-lock.json smh.

## [4.2.1] - 2025-05-31

### Fixed

- Account for differences in yarn's intepretation of the `prepare` script and
  modern npm's.

## [4.2.0] - 2025-05-31

### Changed

- Upgraded from yarn classic to npm.

### Fixed

- Updated outdated peer dependency for @the-draupnir-project/matrix-basic-types

## [4.1.0] - 2025-05-14

### Added

- Quote syntax to quote strings.
- Boolean presentation type and translator to string.

### Fixed

- Added a pathway to create negative integers.

## [4.0.2] - 2025-03-03

### Fixed

- Return an `UnexpectedArgumentError` instead of a `ResultError` when an
  unexpected additional argument is provided to a command.

## [4.0.1] - 2025-02-02

### Fixed

- Fixed a bug in the command dispatcher normaliser that would mean only the
  first argument or designator to any command would be included in the
  normalised command.
  https://github.com/the-draupnir-project/Draupnir/issues/707.

## [4.0.0] - 2025-01-20

### Changed

- The signature of the `CommandDispatcher` `prefixExtractor` callback has been
  changed so that it is possible to transform the entire command body with a
  `commandNormaliser`. This was changed primarily to fix
  https://github.com/the-draupnir-project/Draupnir/issues/678.

### Added

- `makeCommandNormaliser` has been added that covers all the typical corner
  cases for making a bot respond to mentions.

## [3.0.0] - 2024-12-09

### Added

- Numbers will now be parsed by the `TextCommandReader` as a new number
  presentaiton type.

- `PresentationTypeTranslators` now exist so that you can allow presentation
  types to be translated between each other.

- Several standard presentation type translators have been created that target
  the `StringPresentationType`. This is because the command reader parses types
  such as matrix user id's into specialized ones, and this can mess with
  commands that are accepting a string. For example, a reason for a ban.

## [2.6.0] - 2024-10-11

### Added

- Added special handing of the `--no-confirm` keyword to the matrix interface
  adaptor. This allows you to specify confirmation prompts for commands.

## [2.5.0] - 2024-10-07

### Added

- `<h1>` through `<h6>` are now supported in DeadDocument.

- `<hr />` is now supported in DeadDocument.

## [2.4.1] - 2024-09-27

### Changed

- Improved inference on `MatrixInterfaceAdaptor['describeRenderer']`.

## [2.4.0] - 2024-09-20

### Changed

- Verify that commands have renderers inside command dispatcher.

## [2.3.0] - 2024-09-11

### Changed

- Upgraded to `@the-draupnir-project/matrix-basic-types@0.2.0`.
- Upgraded to `@gnuxie/typescript-result@1.0.0`.

## [2.2.0] - 2024-09-10

### Changed

- `RestParameterDescription` can now only prompt one presentation for rest.

## [2.1.0] - 2024-09-10

### Added

- `CommandExecutorHelper` now has a `parseAndInvoke` method to aid unit testing
  commands.

### Changed

- When an argument is missing, command parsers will always get a
  `PromptRequiredError` if a prompt is available on the associated parameter
  description.

## [2.0.0] - 2024-09-09

### Changed

- `MatrixInterfaceAdaptor` callbacks have been simplified and moved into a
  common interface.

## [1.1.1] - 2024-09-09

### Fixed

- `CommandExecutorHelper` type inference.
- `CommandExecutorHelper` keyword properties are now partial instead of
  required.

## [1.1.0] - 2024-09-09

### Added

- `CommandExecutorHelper` to help unit test command executors.

## [1.0.2] - 2024-09-06

### Fixed

- A bug where command designators were not interned into command entries.

## [1.0.1] - 2024-09-06

### Fixed

- `CompleteCommand.toPartialCommand()` method was missing after parsing commands
  with the standard command parser.

## [1.0.0] - 2024-09-06

### Changed

- Everything.
- Better inference from parameter descriptions, no need to specify types in the
  executor.
- Tests moved from Draupnir, some bugs squashed.
- Too much work done.

## [0.1.0] - 2024-08-22

- Initial release.

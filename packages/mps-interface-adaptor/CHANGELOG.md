<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.3] - 2025-12-11

### Changed

- Add an option to only show failed results in `renderRoomSetResult`.

## [0.5.2] - 2025-10-13

### Changed

- Added some more logging in the `MatrixReactionHandler` when fetching the
  reaction map.

## [0.5.1] - 2025-09-29

### Added

- Utility function to render errors to dead document nodes.

## [0.5.0] - 2025-09-25

### Changed

- Updated MPS for new pagination API.

## [0.4.1] - 2025-06-03

### Fixed

- Listeners for `ge.applied-langua.ge.draupnir.reaction_handler` were not being
  given the annotated event. And instead were being provided with a result
  object.

## [0.4.0] - 2025-06-03

### Changed

- Previously we tried to install the matrix-protection-suite under it's scope
  `@gnuxie/matrix-protection-suite`. Unfortunatley, as far as we can tell, in
  Draupnir this peer dependency would not be satisfied unless we installed a
  duplicate package. Which we're just not going to do. So unfortunatley we will
  have to keep the name consistent with the other packages.

## [0.3.0] - 2025-06-03

### Changed

- Forgot to add the `prepare` script smh.

## [0.2.0] - 2025-06-03

### Changed

- Included package information.

## [0.1.0] - 2025-06-03

- Initial release.

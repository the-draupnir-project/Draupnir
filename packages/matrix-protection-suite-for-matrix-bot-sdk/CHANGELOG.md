<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Changelog

All notable changes to this project will be documented in this file.

This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.0.0] - 2026-04-02

### Major changes

- The project scope and repository has changed to
  @the-draupnir-project/Draupnir.

## [4.0.2] - 2025-10-13

### Fixed

- Show v12 rooms as editable.

## [4.0.1] - 2025-10-13

### Fixed

- Paginators for `/messages` and `/relations` weren't emitting errors as
  `ResultError`s.

## [4.0.0] - 2025-10-10

### Changed

- Updated to MPS v4.0.0

### Fixed

- Empty `filter` query parameter being emitted on `/messages` pagination.

## [3.11.0] - 2025-08-14

### Changed

- Policy room creation now uses the `RoomVersionMirror` to determine if rooms
  have prividlidged creators.

## [3.10.0] - 2025-08-14

### Fixed

- Policy room creation in V12 rooms is now supported.

## [3.8.0] - 2025-08-06

### Added

- Implement client capability negotiation on client platform.

## [3.6.6] - 2025-06-23

### Changed

- Updated MPS to v3.6.2

## [3.6.5] - 2025-06-23

### Changed

- MPS v3.6.2 has changed the compatibility of the PersistentConfigBackend and
  PersistentConfigData interfaces

## [3.6.4] - 2025-06-23

### Changed

- We don't trust synapse at all with the room details schema now. it took a few
  times to get the schema right just because there's inconsistencies in the
  documentation and also what is actaully stored in the Synapse rooms table.
  Nightmare.

## [3.6.3] - 2025-06-19

### Changed

- Consolidated room details and room list details schema into one. And mark way
  more fields as nullable.

## [3.6.2] - 2025-06-17

### Fixed

- `knock_restricted` missing from room list details join rules.

## [3.6.1] - 2025-06-17

### Fixed

- Synapse admin room list no longer fails when creator is missing
  https://github.com/element-hq/synapse/issues/18563

## [3.6.0]

### Added

- `listRooms` method to `SynapseAdminClient`.

## [3.5.0]

### Added

- `RoomReactionSender` to client platform.

- Added methods for fetching events to client platform.

### Changed

- Updated to MPS 3.5.0. We skipped some versions to catch up.

## [3.1.1] - 2025-03-29

### Added

- Synapse admin api endpoints for suspend and unsuspend.

## [3.0.0] - 2025-03-23

### Added

- Support for Synapse admin endpoint for querying the block status of a room

- Synapse admin endpoint for shutdown V2

- Synapse admin endpoint for room details.

### Changed

- Support for MPS's new SHA256HashReverser in the `RoomStateManagerFactory`.

## [2.10.1] - 2025-03-03

### Fixed

- Logging of unknown request errors has been improved.

## [2.6.0] - 2025-01-24

### Added

- Room state will automatically refresh in the `RoomStateManagerFactory` when
  the backing store is used.

- Implemented `RoomStateGetter` capability from MPS 2.6.0.

## [2.5.2] - 2025-01-18

### Fixed

- Fix an issue where the implementation of the RoomUnbanner capability was
  actually calling `/ban`.

## [2.5.0] - 2025-01-12

### Added

- Implemented `RoomInviter` on MPS's `ClientPlatform`.

## [2.4.0] - 2025-01-10

### Added

- `SynapseAdminClient['getAbuseReports']`.

## [2.3.2] - 2025-01-09

### Fixed

- Typo in room resolvation code LwL.

## [2.3.1] - 2025-01-09

### Fixed

- Resolving room aliases now takes the via servers from the server response
  https://spec.matrix.org/v1.10/client-server-api/#get_matrixclientv3directoryroomroomalias

## [1.5.0] - 2024-10-01

### Changed

- MPS `v1.5.0`.

### Added

- Implementation for `PersistentConfigBackend`.

## [1.4.0] - 2024-09-17

### Changed

- Skip calling `/join` if we already are joined with `RoomJoiner` and
  `ClientRooms`.
- Upgraded to matrix-protection-suite@1.4.0.

## [1.3.0] - 2024-09-11

### Changed

- Upgraded to matrix-protection-suite@1.3.0.

## [1.2.0] - 2024-09-09

### Changed

- Upgraded to matrix-protection-suite@1.2.0.

## [1.1.0] - 2024-08-26

### Changed

- Upgraded to matrix-protection-suite@1.1.0.
- Implemented `RoomMessageSender` on `ClientPlatform`.

## [1.0.0] - 2024-08-16

### Changed

- Upgraded to matrix-protection-suite@1.0.0.

## [0.24.0] - 2024-08-16

### Changed

- Upgraded to matrix-protection-suite@0.24.0

- Moved to @the-draupnir-project/matrix-basic-types.

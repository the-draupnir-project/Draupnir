<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Changelog

All notable changes to this project will be documented in this file.

This project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [7.0.0] - 2026-04-02

### Major changes

- Project scope moved from @gnuxie to @the-draupnir-project
- the matrix-protection-suite now lives in the Draupnir monorepo
  https://github.com/the-draupnir-project/Draupnir

### Minor Changes

- 7bb9d51: Fix method names around room v12 privileged creators to no longer
  have typos

### Patch Changes

- 5870c02: Fixed a bug where User policies of any recommendation would result in
  the MemberBanSynchronisationProtection banning users. This is was a
  particularly important issue for compatibility with Meowlnir.

## [6.0.0] - 2025-12-12

### Changed

- `ServerConsequences` is no longer a generic capability provider and is now
  specific to the `ServerBanSynchronisationProtection` (as it should have been
  all along). The capability providers associated with the interface have now
  been renamed which is a breaking change.

- The `ServerBanSynchronisationProtection` now depends on its own intent
  projection for producing ACL updates.

### Added

- `SemanticType` abstraction in attempt to get the benefits of TDD without
  creating meaningless tests. I don't mean to imply that TDD leads to
  meaningless tests, but this abstraction helps ensure that all tests are
  created in relation to an interface type and their reason to exist is
  documented. As well as focussing on checking the behavioural contracts that
  are normally implicit to interfaces. So it's an interesting feature.

- `HandleRegistry` abstraction to help modularise the "glue code" that sticks
  protection handles up to their data sources. This is particularly important
  because this glue code normally involves resource management (because
  listeners are resources). And it's bad if resource management code exists in
  an ad-hoc way. Handles are described with a `HandleDescription`, which are
  then placed into a `HandleRegistryDescription` which describes the handles
  available for a specific context type. And then a `HandleRegistry` which helps
  bind the handles for a specific context and for specific plugins.

## [5.1.0] - 2025-11-21

### Added

- Generalised the various variations of the revision issuer abstraction into a
  `Projection` interface.

- Added _Intent projections_ for the `MemberBanSynchronisation` and
  `ServerBanSynchronisation` standard protections. These show what the
  protections _intend_ to effect with capabilities before capabilities attempt
  to realise that intent. Think of them as the effect and the capabilities as
  the effect handler.

- All protections can make use of _intent projections_ but obviously migrating
  the logic will take some time. Especially as the upstream revision issuers
  have not been migrated to projections and may be missing detail that is
  normally fetched from protection's arbitrary hooks. It's important to note
  that the intent projections are deterministic. Whereas protections typically
  have non-determinism mixed within them. To work around these instances you
  will have to make input projections to act as sources of non determinism. And
  this keeps all non determinism at the sources or sinks of the dataflow within
  MPS.

- _Lifetimes_ now have ease of use methods for allocating implementations of the
  ``Symbol.dispose`/`Symbol.asyncDispose` methods.

## [5.0.0] - 2025-10-28

### Changed

- `Lifetime` abstraction introduced for resource management. Is meant to replace
  adhoc `unregisterListener` methods.
  https://github.com/the-draupnir-project/planning/issues/79. Protection
  contructor API has been broken as a result as all protections now get a child
  Lifetime from the `ProtectionManager` that they can atomically allocate
  resources against.

## [4.1.0] - 2025-10-10

### Changed

- Protection settings are now stored before enabling the protection when
  protection settings are changed. This is to prevent error loops when
  protections modify their own settings.

## [4.0.0] - 2025-10-01

### Changed

- `PermalinkSchema` has been split into different schema for each kind of
  matrix.to url. This wasn't done before because we didn't know how to make a
  TypeBox transforms for the same base type work in a union.

## [3.13.0] - 2025-09-29

### Added

- `RoomVersionMirror['privilidgedCreators']` method for fetching creators from
  the create event.

## [3.12.0] - 2025-09-25

### Changed

- Pagination has been reworked with a cleaner less stateful API.

### Added

- `KeyedBatchQueue` allows batching items in a queue around a costly operation
  e.g. calls to `/messages`.

### Fixed

- `ReactionEvent` schema no longer declares content to be optional

## [3.11.0] - 2025-08-14

### Added

- `RoomCreateEvent` schema for `m.room.create`

- `RoomVersionMirror` for determining if a room version supports _prividlidged
  creators_.

### Changed

- `PowerLevelsMirror` now needs to consider the create event and room version.

## [3.10.0] 2025-08-12

### Added

- Batches can now be cancelled.

## [3.9.0] - 2025-08-07

### Added

- Tombstone event schema.

## [3.8.0] - 2025-08-06

### Added

- Client capabilities negotiation to client platform.

## [3.7.1] - 2025-06-23

### Fixed

- Prevent compatible PersistentConfigData and PersistentConfigBackend. We had
  instantiated a PersistentConfigBackend instance to provide to a dependency
  requiring a PersistentConfigData instance. So we must now make these
  interfaces mutually incompatible.

## [3.7.0] - 2025-06-23

### Added

- New concept of event mixin, which largely already exists within Matrix. These
  are essentially groups of proprties that may appear in matrix events of
  different types to render media. They are the basis of the "Extensible events"
  series of MSCs.

- To parse mixins, we use description objects that implement the
  `EventMixinDescription` interface.

- `handleTimelineEventMixins` callback has been added to the `Protection`
  interface. This allows protections to handle specific pre-parsed mixins from
  events.

### Changed

- Should events fail to parse in accordance to their schema, their `type` will
  be changed to `me.marewolf.undecodable_content`, and the content will be
  hidden behind `UnsafeContentKey`. This still allows their mixins to be
  extracted and presented to protections.

## [3.6.1] - 2025-06-17

### Fixed

- Fixed a bug where protections were not disabled when the _protected rooms set_
  was disposed.

## [3.6.0] - 2025-06-13

### Added

- `TimedGate` interface. The idea is just a simple scheduler for a background
  task that will only allow 1 task to run at a time and 1 task to be scheduled
  to run, without chaining. This is perfect for e.g. scanning the synapse room
  directory or synchronising server ACL across a protected rooms set.

### Changed

- `ConstantPeriodBatch` is now cancellable.

## [3.5.0] - 2025-06-02

### Added

- `ClientPlatform` has been extended to include `toRoomReactionSender` and
  `toRoomEventGetter`. Which are both capabilities for reacting to and fetching
  individual events.

## [3.4.0] - 2025-05-29

### Fixed

- Stop using the unnamespaced `hashes` property in MSC4205 hashed entities when
  writing policies.

### Changed

- The interface of `ProtectionsManager['changeProtectionSettings']` now returns
  the new instance of the protection created by the protection description
  factory. This is so that the method can be used from protection factories
  themselves to alter protection settings.

## [3.3.0] - 2025-05-27

### Added

- Methods for find rooms by creators and the room creator's server as additional
  info in the hash store.

## [3.2.0] - 2025-05-26

### Changed

- Change protection factories to be async. It's not clear why they weren't async
  to begin with but this allows for more advanced factory code.

## [3.1.2] - 2025-05-20

### Fixed

- `ServerACLConsequences` no longer naively updates the server ACL in Matrix
  rooms.

## [3.1.1] - 2025-04-13

### Fixed

- `isSimulated` property on the `Capability` interface was broken.

## [3.1.0] - 2025-03-28

### Added

- `destroy` method to hash store interface.

- `membersOfMembership` method to `RoomMembershipRevision`.

## [3.0.0] - 2025-03-23

### Added

- Introduced `matchType` enum onto `PolicyRule` splitting the `PolicyRule` type
  into three variants:
  - `Literal`
  - `Glob`
  - `HashedLiteral`

- The `PolicyRuleChangeType`enum to replace `SimpleChangeType` on
  `PolicyRuleChange`.
  - This brings a new variant `RevealedLiteral` for when a `HashedLiteral`
    policy rule has been reversed by the `SHA256HashReverser`.

- Introduced the `HashedLiteral` `PolicyRule` variant whereby `entity` is
  missing and is replaced with a `Record` mapped from algorithm to hash.

- The `SHA256HashReverser` has been added to reverse policies in
  _PolicyRoomRevisionIssuers_ created by a `PolicyRoomManager`. This works in
  conjunction with a store to match `HashedLiteral` policy rules against known
  entity literals. Any matches will then be given the the
  `PolicyRoomRevisionIssuer` to revise their `currentRevision` and emit a
  revision event with the change `RevealedLiteral`.

- The `SHA256HashStore` interface has been created to store reversed hashes for
  the `SHA256HashReverser`. No implementation is provided in the
  matrix-protection-suite you must bring your own. Support for reversing
  policies is currently focussed on rooms. We haven't added a way to reverse
  membership policies yet... we will probably do this at the
  `RoomMembershipRevisionIssuer` level by only calculating the hash at true
  first join. We will probably also add a way for the hash function to be
  injected so that you can depend on Subtle or node crypto.

### Changed

- `reason` is now optional on policy rule events to support the
  `org.matrix.msc4204.takedown` recommendation.

- The `PolicyListRevision` interface has new utilities for dealing with hashed
  policies and the interface has changed to accomidate for them.

- `PolicyRuleChange['changeType']` uses the `PolicyRuleChangeType` enum.

## [2.10.0] - 2025-02-12

### Added

- Introduced simulated capabilities. All of the Standard capabilities now have a
  simulated version that have no effects.

- Capability renderers can now designate themselves as the default renderer for
  a capability interface.

- Only one simulated capability and default renderer can be associated with a
  capability interface.

## [2.9.0] - 2025-02-10

### Added

- Introduced a new `WatchedPolicyRooms` abstraction by factoring out
  `PolicyRoomRevision` issuer managemenent from `PolicyRoomsConfig`. This now
  replaces `PolicyRoomsConfig` and the `issuerManager` property in the protected
  rooms set.

- Expose a way to get the `time` a `Revision` was created.

### Fixed

- `revisionID` is now exported on `StateRevision`.

## [2.8.0] - 2025-02-03

### Added

- `findCompatibleCapabilityProviders` function.

### Fixed

- Improved descriptions of all standard capability providers.

## [2.7.0] - 2025-02-01

### Added

- Generic item batching is now available for protections to use by using the
  `StandardBatcher`.

### Changed

- `Task` has been improved to be more liberal in the closures it accepts. And
  `Task` now has more options for logging how tasks have failed.

- The `Protection` callback `handleExternalInvite` has been renamed to
  `handleExternalMembership`.

### Fixed

- An issue where adding rooms to the protected rooms set more than once could
  sometimes cause duplicate events to be propagated.

## [2.6.0] - 2025-01-24

### Changed

- `StandardRoomStateRevisionIssuer` now accepts the `RoomStateGetter` capability
  rather than a callback for fetching room state.

### Removed

- `RoomStateManager['getRoomState']` has been removed and the same functionality
  is now provided by by the `RoomStateGetter` capability

### Added

- `RoomStateGetter` capability to fetch room state from a room.

## [2.5.2] - 2025-01-18

### Fixed

- Fix SchemedMatrixData putting the wrong version number into data. Sadly a
  complication of https://github.com/the-draupnir-project/Draupnir/issues/560.

## [2.5.1] - 2025-01-14

### Fixed

- An issue with the `SetRoomMembershipRevisionIssuer` that would allow duplicate
  listeners to be added to rooms that were already in the set. This would cause
  lots of issues with downstream revision listeners. We've hardened code
  downstream, e.g. with the `MembershipPolicyRevisionIssuer`, in case this
  happens again.

## [2.5.0] - 2025-01-12

### Added

- `RoomInviter` to `ClientPlatform`.

## [2.4.0] - 2025-01-10

### Fixed

- `StandardProtectionsConfig` now uses the provided `SchemedDataManager` to
  persist the config while disabling protections. This was a bug, it was always
  supposed to use the `SchemedDataManager` to persist the version number
  alongside the serialized data. Fixes
  https://github.com/the-draupnir-project/Draupnir/issues/560.

- The `SynapseAdminReport['name']` property is now appropriately unioned with
  `null`.

### Added

- The `user_id` field is now present on the `SynapseAdminReport` schema.

- Access to unique member count of `SetMembership` via
  `SetMembership['uniqueMemberCount']`.

## [2.3.0] - 2025-01-08

### Added

- `SchemaMigration` now provides the schema version number to use rather than
  relying on deltas to hand type the number and mess up.

### Changed

- Interface of `ServerConsequences['consequenceForServersInRoom']` has changed
  so that it is possible to determine if any changes/effects have been made
  after calling. Changed to support
  https://github.com/the-draupnir-project/Draupnir/issues/450.

- The `ServerACLEvent` Schema wrongly described `content` as optional.

### Fixed

- There was a bug where unwatching a list would cause only the list you wanted
  to unwatch to become watched.
  https://github.com/the-draupnir-project/Draupnir/issues/647.

- Getting the name of the capability wrong for capability context glue will now
  result in an error.

## [2.2.0] - 2025-01-06

### Added

- `SetMembershipRevision` for calculating whether a Matrix user is the member of
  any room in a set of rooms.

- `MembershipPolicyRevision` for easily finding policy rules that match users
  within a `SetMembershipRevision`. This revision stops protections or
  capabilities from needing to calculate matches themselves.

### Fixed

- `DirectPolicyListRevisionIssuer` now emits the `'revision'` event when policy
  rooms are watched and unwatched.

### Changed

- `UserConsequences` now accepts an argument for `TargetMember[]` rather than a
  `PolicyListRevision`, so that it can be used in conjunction with the new
  `MembershipPolicyRevision`.

## [2.1.1] - 2024-12-09

### Fixed

- A bug where `ConfigMirror['setValue']` would try encode a value that was
  already encoded.

## [2.1.0] - 2024-12-04

### Added

- Added a method to protections manager for changing a capability in a
  protection's capability set.
- Made capability provider set config actually persist by giving it a
  PersistentConfigBackend.

## [2.0.0] - 2024-11-26

### Changed

- `ProtectionsManager` depends on three different kinds of config. Config for
  capability providers, protection settings, and enabled protections.

### Removed

- `ProtectionSettings` are gone.

## [1.7.0] - 2024-10-10

### Added

- `JoinRulesEvent` and `JoinRulesEventContent` are now available to use.

## [1.6.0] - 2024-10-04

### Changed

- `ConfigParseError` and `ConfigPropertyError` now reference the relevant
  `ConfigDescription`.

## [1.5.2] - 2024-10-02

### Fixed

- Having valid but unjoinable rooms in `ProtectedRoomsConfig` is now a
  recoverable error.

## [1.5.1] - 2024-10-01

### Fixed

- Fixed a bug where the `MjolnirPolicyRoomsConfig` would show `undefined` in the
  description of `ConfigPropertyErrors`.

## [1.5.0] - 2024-10-01

### Added

- `PersistentConfigData` helper for dynamically editing schemed config files,
  and recovering from parse errors.

### Changed

- `MjolnirProtectedRoomsConfig`, `MjolnirWatchedListsConfig`,
  `MjolnirEnanbledProtections` have all been migrated to use
  `PersistentConfigData` with recovery options.

## [1.4.0] - 2024-09-11

### Changed

- Allow `RoomJoiner` to skip calling `/join`.

## [1.3.0] - 2024-09-11

### Changed

- Upgraded `@gnuxie/typescript-result`.
- Made `ActionException['toString']` clearer.
- Made it more clear which room is causing issues for the
  `ProtectedRoomsManager` as it is created.

## [1.2.0] - 2024-09-09

### Added

- `DeclareRoomState` and associated helpers are now exported.
- This includes the `describeProtectedRoomsSet` utility which easily allows you
  to fake a protected rooms set.

## [1.1.0] - 2024-08-26

### Added

- The `RoomMessageSender` capability is now available on `ClientPlatform`.

## [1.0.0] - 2024-08-16

### Changed

- The `Permalink` TypeBox Schema has been renamed to `PermalinkSchema`.

- I guess we're doing semver properly now? since weh.

## [0.24.0] - 2024-08-16

### Changed

- Depend upon `@the-draupnir-project/matrix-basic-types` to provide
  `StringUserID`, `MatrixRoomReference`, `MatrixGlob`, and associated types.

- Depend upon `@gnuxie/typescript-result` to provide `ActionResult`.

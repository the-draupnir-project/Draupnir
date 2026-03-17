<!--
SPDX-FileCopyrightText: 2026 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: 0BSD
-->

# Dependencies

## Pinned dependencies

### @vector-im/matrix-bot-sdk

This is pinned and overridden because we need to have the exact same version for
all dependencies. As we create and pass `MatrixClient` through Draupnir,
matrix-protection-suite-for-matrix-bot-sdk, the vector bot-sdk fork itself, and
also matrix-appservice-bridge.

### postgres

https://github.com/porsager/postgres/issues/1143

This is pinned specifically as a work around for this issue.

## Workspace dependencies

Workspace dependencies should be kept at their same version and changesets
should be used for any changes. Package release should only be made from the
main branch once changesets have been merged and the associated package versions
bumped. This allows for the workspace state to always be used to build Draupnir
reproducibly on any branch of PR.

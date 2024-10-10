<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Changelog

All notable changes to Draupnir will be kept in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - 2024-10-04

### Changed

- The Node version required to run Draupnir has been updated to Node 20.

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

## Versions v2.0.0-beta.7 and prior

Please see [Releases](https://github.com/the-draupnir-project/Draupnir/releases)
for more information.

<!-- Remove me later. Currently points to releases as this is a Unreleased change.
As soon as the release is made change the note to point to the release. -->

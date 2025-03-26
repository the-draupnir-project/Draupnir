<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Draupnir

A highly capable [Matrix](https://matrix.org) moderation bot and protection
platform, trusted by room moderators and homeserver admins alike.

Visit [#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org) in your
client and come say hi.

Please see the
[draupnir documentation](https://the-draupnir-project.github.io/draupnir-documentation/)
for installation instructions and usage guides.

## Features

- Draupnir's UX is centred around prompting you with questions to carry out
  specific moderation tasks by shadowing the actions taken by your Matrix
  Client.

- Draupnir synchonises bans for users, and servers across all of the matrix
  rooms that you moderate

- Draupnir can protect your community by applying policies from community
  curated policy lists. For example lists such as the the
  [community moderation effort](https://matrix.to/#/#community-moderation-effort-bl:neko.dev),
  can be watched to protect your rooms around the clock. This means that
  adjacent Matrix communities can warn and protect each other of known threats.
  Draupnir and the list provided by the community moderation effort are the
  bread and butter essentials of moderating public spaces on Matrix.

- Draupnir includes a series of
  [protections](https://the-draupnir-project.github.io/draupnir-documentation/protections)
  that can be enabled that can help you in given scenarios when your community
  is being targeted.

- Draupnir includes
  [homeserver administrative](https:/the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration)
  features, such as reviewing abuse reports, deactivating user accounts and
  shutting down rooms. This also includes protecting your homeserver with
  Draupnir's watched policy rooms.

- Draupnir is primarily a room moderation bot and can be used with or without
  server administrative capabilities.

- **Draupnir is a forwards and backwards compatible drop in replacement for
  [Mjolnir](https://github.com/matrix-org/mjolnir)**.

### Prompt UX

The main difference from Mjolnir is that it is no longer necessary to use
commands for some functions. Banning a user in a protected room from your Matrix
client will cause Draupnir to show a prompt in the management room, which will
offer to add the ban to a policy list[^the-gif-width].

![A demo showing a propagation prompt](docs/ban-propagation-prompt.gif)

You can also unban users the same way, and Draupnir will prompt you to unban
them without any confusing hiccups. If you do still wish to use the ban command,
please note that users and other entities that are being banned are now the
first argument to the ban command. It is now also possible to provide only the
entity to Draupnir and have Draupnir prompt you for the policy list and the ban
reason.

![A demo showing the ban command](docs/ban-command-prompt.gif)

In general, all commands have been migrated to a new interface which feature
better error messages for common problems and allow admins to trace the cause of
unexpected errors much more easily.

[^the-gif-width]:
    Yes, i know they don't align horizontally, you are welcome to suggest how
    this should be fixed.

### Technical differences from Mjolnir and other moderation bots

> I offer you the ring, which was burned, laid upon the pyre of Baldr by Odin.

Draupnir started as a fork of [Mjolnir](https://github.com/matrix-org/mjolnir),
in order to radically refactor the code base and break a feature freeze.
Draupnir has now completed this refactor and large sections of the the code base
are now very distinct, as much of Draupnir was rewritten.

**Draupnir remains a forwards and backwards compatible drop in replacement for
Mjolnir**.

- Draupnir is much less dependant on commands and will automatically send
  prompts to the management room. Prompts are sent for inviting Draupnir to
  protect rooms, watch policy lists, ban users, and unban users.

- Draupnir is much more responsive. Unlike Mjolnir and other bots, Draupnir does
  not need to request any data from the homeserver before applying new bans or
  to ban new users.

- Draupnir uses an advanced persistent revision system for room state, members,
  policies, and policy matches. By using revisions, Draupnir only has to process
  room state once in terms of simple deltas as room state is updated.

- Draupnir offers a
  [room state backing store](https://github.com/the-draupnir-project/Draupnir/blob/69b666e56d89472c05175685267b333a7ab988fe/config/default.yaml#L186-L192),
  allowing Draupnir to startup quickly, even when deployed at distance from the
  homeserver.

- Draupnir's core functionality is implemented as protections, which can be
  configured and dynamically turned on and off. If you can write even a little
  JS/TS, Draupnir's behaviour can be radically changed or customized. And
  because the core functionality is implemented with the extension system, there
  are less limits.

- A huge effort has been spent refactoring the code base, paving the way for
  future feature development of Draupnir and adjacent projects. This includes
  the rewrite of the core of Draupnir into the
  [matrix-protection-suite](https://github.com/Gnuxie/matrix-protection-suite),
  providing all the Matrix client code required to operate a protection
  platform. The matrix-protection-suite also covers severall shortfalls in the
  available SDK's, providing event parsing and types that keep code secure and
  sound. The
  [interface-manager](https://github.com/the-draupnir-project/interface-manager)
  providing an advanced command-oriented interface (note, this does not mean
  command-line interface). The
  [matrix-basic-types](https://github.com/the-draupnir-project/matrix-basic-types)
  library for dealing with Matrix's various string types. And finally the
  introduction of [prettier](https://prettier.io/),
  [eslint](https://eslint.org/) and
  [typescript-eslint](https://typescript-eslint.io/) into Draupnir's development
  tooling, modernising TypeScript development.

## Status

Draupnir is being supported with a grant from NLnet, the goals of the work are
described [here](https://marewolf.me/posts/draupnir/24-nlnet-goals.html)

Currently The UX and code base of Draupnir has been overhauled and we have
recently passed a huge milestone: Draupnir's 2.0.0 release.

### Migration

Migrating from Mjolnir is straightforward and requires no manual steps,
migration for your setup is likely as simple as changing your server config to
pull the latest Draupnir docker image instead of a mjolnir one. Draupnir remains
backwards compatible so that it is possible to try Draupnir and still have the
option to switch back to Mjolnir.

Any problems with migration should be reported to our
[support room](https://matrix.to/#/#draupnir:matrix.org).

## Setting up

See the
[setup documentation](https://the-draupnir-project.github.io/draupnir-documentation/bot/setup)
for first-time setup documentation.

See the [configuration sample with documentation](config/default.yaml) for
detailed information about Draupnir's configuration.

See
[homeserver administration](https://the-draupnir-project.github.io/draupnir-documentation/bot/homeserver-administration)
for how to use Draupnir's features to protect your homeserver and users.

## Quickstart guide

After your bot is up and running, you'll want to run a couple commands to get
everything set up:

1. `!draupnir list create my-coc code-of-conduct-ban-list` - This will create a
   new ban list with the shortcode `my-coc` and an alias of
   `#code-of-conduct-ban-list:example.org`. You will be invited to the room it
   creates automatically where you can change settings such as the visibility of
   the room.
2. Review the
   [Moderator's Guide](https://the-draupnir-project.github.io/draupnir-documentation/moderator/setting-up-and-configuring).
3. Review `!draupnir help` to see what else the bot can do.

## Legacy documentation (`v1.87.0` and below)

For information about the legacy version of Draupnir, see `v1.87.0`, the
documentation for which can be found
[here](https://github.com/the-draupnir-project/Draupnir/tree/v1.87.0).

## Contributing & Opening Issues

Draupnir wants to be yours as much as it is ours. Please see or
[contributing document](https://the-draupnir-project.github.io/draupnir-documentation/contributing),
but do not worry too much about following the guidance to the letter. And keep
that in mind throughout.

## Supported by

### NLnet

This project is funded through [NGI Zero Core](https://nlnet.nl/core), a fund
established by [NLnet](https://nlnet.nl) with financial support from the
European Commission's [Next Generation Internet](https://ngi.eu) program. Learn
more at the [NLnet project page](https://nlnet.nl/project/Draupnir).

[<img src="https://nlnet.nl/logo/banner.png" alt="NLnet foundation logo" width="20%" />](https://nlnet.nl)
[<img src="https://nlnet.nl/image/logos/NGI0_tag.svg" alt="NGI Zero Logo" width="20%" />](https://nlnet.nl/core)

You can find details of the work that is being supported from NLnet
[here](https://nlnet.nl/project/Draupnir/) and the goals
[here](https://marewolf.me/posts/draupnir/24-nlnet-goals.html).

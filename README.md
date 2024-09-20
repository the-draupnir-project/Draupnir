<!--
SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>

SPDX-License-Identifier: CC-BY-SA-4.0
-->

# Draupnir

A [Matrix](https://matrix.org) moderation bot and protections platform.
Visit [#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org)
in your client and come say hi.

Please see the [draupnir
documentation](https://the-draupnir-project.github.io/draupnir-documentation/)
for installation instructions and usage guides.

## Features

Draupnir has two main functions, the first is to synchronise bans for
users and servers across all of the matrix rooms that you moderate.
The second is to protect your community by applying policies from community curated
policy lists, for example the [community moderation effort](https://matrix.to/#/#community-moderation-effort-bl:neko.dev),
to your rooms around the clock. This means that communities can warn
and protect each other of known threats.

Draupnir also includes a series of protections that can be enabled
that might help you in some scenarios.

By default Draupnir includes support for user bans, redactions and
server ACLs.

Some support is also provided for server administrative functions,
such as reviewing abuse reports, deactivating user accounts and
shutting down rooms.

### Differences from Mjolnir

> I offer you the ring, which was burned, laid upon the pyre of Baldr by Odin.

Draupnir started as a fork of [Mjolnir](https://github.com/matrix-org/mjolnir),
and is a continuation of Mjolnir. However, large sections of the the
code base are now very distinct and much of Draupnir was rewritten
into a library called the [matrix-protection-suite](https://github.com/Gnuxie/matrix-protection-suite).

#### Changes in `v2.0.0-beta.*` (pre-release)

* Draupnir's new core efficiently caches room state and room
  membership allowing Draupnir to be much more responsive than
  Mjolnir.

* Draupnir is much less dependant on commands
  and will automatically send prompts to the managment room.
  Prompts are sent for inviting Draupnir to protect rooms,
  watch policy lists, ban users, and unban users.

* Draupnir offers a [room state backing
  store](https://github.com/the-draupnir-project/Draupnir/blob/main/config/default.yaml#L206-L212),
  allowing Draupnir startup quickly, even when deployed at distance
  from the homeserver.

* Draupnir's core functionality is implemented as protections,
  which can be dynamically turned on and off.

#### Changes in latest `v1.87.0`

The main difference from Mjolnir is that it is no longer necessary to use
commands for some functions. Banning a user in a protected room from your
Matrix client will cause Draupnir to show a prompt in the management room,
which will offer to add the ban to a policy list[^the-gif-width].

![A demo showing a propagation prompt](docs/ban-propagation-prompt.gif)

You can also unban users the same way, and Draupnir will prompt you
to unban them without any confusing hiccups.
If you do still wish to use the ban command, please note that users
and other entities that are being banned are now the first argument
to the ban command. It is now also possible to provide only the entity to
Draupnir and have Draupnir prompt you for the policy list and the ban reason.

![A demo showing the ban command](docs/ban-command-prompt.gif)

In general, all commands have been migrated to a new interface which
feature better error messages for common problems and allow admins
to trace the cause of unexpected errors much more easily.

[^the-gif-width]:
    Yes, i know they don't align horizontally,
    you are welcome to suggest how this should be fixed.

## Status

Draupnir is being supported with a grant from NLnet,
the goals of the work are described [here](https://marewolf.me/posts/draupnir/24-nlnet-goals.html)

Currently The UX and code base of Draupnir has been overhauled and
Draupnir is moving towards a 2.0.0 release.

As Draupnir heads towards `v2.0.0`, releases will appear [here](https://github.com/Gnuxie/Draupnir/releases).
Until `v2.0.0` there will be frequent changes to commands but all of these
will be noted in the changes for that release.

Currently, we are running a beta channel (`v2.0.0-beta.*`). As of now
all functionality apart from dynamic configuration of protection
settings is stable in the beta channel.

For the latest stable release, see `v1.87.0`, the documentation
for which can be found [here](https://github.com/the-draupnir-project/Draupnir/tree/v1.87.0).

### Migration

Migrating from Mjolnir is straightforward and requires no manual steps,
migration for your setup is likely as simple as changing your server config to
pull the latest Draupnir docker image instead of a mjolnir one.
Draupnir remains backwards compatible so that it is possible to try Draupnir
and still have the option to switch back to Mjolnir.

Any problems with migration should be reported to our [support room](https://matrix.to/#/#draupnir:matrix.org).

## Setting up

See the [setup documentation](https://the-draupnir-project.github.io/draupnir-documentation/bot/setup) for first-time setup documentation.

See the [configuration sample with documentation](config/default.yaml) for detailed information about Draupnir's configuration.

See the [synapse module documentation](docs/synapse_module.md) for information on how to setup Draupnir's accompanying Synapse Module.

## Quickstart guide

After your bot is up and running, you'll want to run a couple commands to get everything
set up:

1. `!draupnir list create my-coc code-of-conduct-ban-list` - This will create a new ban list
   with the shortcode `my-coc` and an alias of `#code-of-conduct-ban-list:example.org`. You
   will be invited to the room it creates automatically where you can change settings such
   as the visibility of the room.
2. Review the [Moderator's Guide](https://the-draupnir-project.github.io/draupnir-documentation/moderator/setting-up-and-configuring).
3. Review `!draupnir help` to see what else the bot can do.

## Enabling readable abuse reports

Since version 1.2, Draupnir offers the ability to replace the Matrix endpoint used
to report abuse and display it into a room, instead of requiring you to request
this data from an admin API.

This requires two configuration steps:

1. In your Draupnir configuration file, typically `/etc/draupnir/config/production.yaml`, copy and paste the `web` section from `default.yaml`, if you don't have it yet (it appears with version 1.20) and set `enabled: true` for both `web` and
   `abuseReporting`.
2. Setup a reverse proxy that will redirect requests from `^/_matrix/client/(r0|v3)/rooms/([^/]*)/report/(.*)$` to `http://host:port/api/1/report/$2/$3`, where `host` is the host where you run Draupnir, and `port` is the port you configured in `production.yaml`. For an example nginx configuration, see `test/nginx.conf`. It's the confirmation we use during runtime testing.

### Security note

This mechanism can extract some information from **unencrypted** rooms. We have
taken precautions to ensure that this cannot be abused: the only case in which
this feature will publish information from room _foo_ is:

1. If it is used by a member of room _foo_; AND
2. If said member did witness the event; AND
3. If the event was unencrypted; AND
4. If the event was not redacted/removed/...

Essentially, this is a more restricted variant of the Admin APIs available on
homeservers.

However, if you are uncomfortable with this, please do not activate this feature.
Also, you should probably setup your `production.yaml` to ensure that the web
server can only receive requests from your reverse proxy (e.g. `localhost`).

## Contributing & Opening Issues

Draupnir wants to be yours as much as it is ours.
Please see or [contributing document](https://the-draupnir-project.github.io/draupnir-documentation/contributing), but do not
worry too much about following the guidance to the letter. And
keep that in mind throughout.

## Supported by

### NLnet foundation

<p>
   <img src="https://nlnet.nl/logo/banner.svg" width="25%" hspace="10">
   <img src="https://nlnet.nl/image/logos/NGI0Core_tag.svg" width="25%" hspace="10">
</p>

Draupnir is supported by the NLnet foundation and
[NGI Zero](https://nlnet.nl/NGI0/) under the
[NGI Zero Core](https://nlnet.nl/core/) programme.

You can find details of the work that is being supported from NLnet
[here](https://nlnet.nl/project/Draupnir/) and the goals
[here](https://marewolf.me/posts/draupnir/24-nlnet-goals.html).

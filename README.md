# Draupnir

A moderation tool for Matrix. Visit [#draupnir:matrix.org](https://matrix.to/#/#draupnir:matrix.org)
for more information.

> I offer you the ring, which was burned, laid upon the pyre of Baldr by Odin.

This is a continuation and fork of [Mjolnir](https://github.com/matrix-org/mjolnir),
with an entirely new framework for interacting with Matrix written to
overcome some of the burdens there were holding development of mjolnir.

## Status

The command handler is currently being refactored and some command syntax will become
incompatible with legacy Mjolnir commands.
The UX is being overhauled and Draupnir is slowly moving towards a 2.0.0 release.

As Draupnir heads towards `v2.0.0`, releases will appear [here](https://github.com/Gnuxie/Draupnir/releases).
Until `v2.0.0` there will be frequent changes to commands but all of these
will be noted in the changes for that release.

### Migration

Migrating from Mjolnir is straightforward and requires no manual steps,
migration for your setup is likely as simple as changing your server config to
pull the latest Draupnir docker image instead of a mjolnir one.
Draupnir remains backwards compatible so that it is possible to try Draupnir
and still have the option to switch back to Mjolnir.

Any problems with migration should be reported to our [support room](https://matrix.to/#/#draupnir:matrix.org).

## Features

As an all-in-one moderation tool, Draupnir can protect your community by
applying policies from both your own and community curated policy lists.

The bot by default includes support for bans, redactions, anti-spam, server ACLs, room
directory changes and room alias transfers.

Support is also provided for some Synapse admin functions such as account
deactivation and room shutdown.

A Synapse module is also available to apply the same rulesets the bot is watching
across an entire homeserver.

### Differences from Mjolnir

The main difference from Mjolnir is that it is no longer necessary to use
commands for some functions. Banning a user in a protected room from your
Matrix client will cause Draupnir to show a prompt in the management room,
which will offer to add the ban to a policy list.

If you do still wish to use the ban command, please note that users
and other entities that are being banned are now the first argument
to the ban command. It is now also possible to provide only the entity to
Draupnir and have Draupnir prompt you for the policy list and the ban reason.

In general, any command that has been migrated to the new interface will
feature better error messages for common problems and allow admins
to trace the cause of unexpected errors much more easily.

## Setting up

See the [setup documentation](docs/setup.md) for first-time setup documentation.

See the [configuration sample with documentation](config/default.yaml) for detailed information about Draupnir's configuration.

See the [synapse module documentation](docs/synapse_module.md) for information on how to setup Draupnir's accompanying Synapse Module.

## Quickstart guide

After your bot is up and running, you'll want to run a couple commands to get everything
set up:

1. `!draupnir list create coc code-of-conduct-ban-list` - This will create a new ban list
   with the shortcode `coc` and an alias of `#code-of-conduct-ban-list:example.org`. You
   will be invited to the room it creates automatically where you can change settings such
   as the visibility of the room.
2. `!draupnir default coc` - This sets the default ban list to the list we just created to
   help with the ban commands later on.
3. Review the [Moderator's Guide](https://github.com/matrix-org/mjolnir/blob/main/docs/moderators.md).
4. Review `!mjolnir help` to see what else the bot can do.

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
this feature will publish information from room *foo* is:

1. If it is used by a member of room *foo*; AND
2. If said member did witness the event; AND
3. If the event was unencrypted; AND
4. If the event was not redacted/removed/...

Essentially, this is a more restricted variant of the Admin APIs available on
homeservers.

However, if you are uncomfortable with this, please do not activate this feature.
Also, you should probably setup your `production.yaml` to ensure that the web
server can only receive requests from your reverse proxy (e.g. `localhost`).

## Development

Draupnir is a TypeScript project that depends on the labour of a handful of
developers, testers and users. The code base is in relatively good shape,
and if you would like to contribute or gain an understanding of the workings
of Draupnir, please read our [context document](./docs/context.md).

Once you have done that, go ahead and read our [contributing document](./CONTRIBUTING.md)

### Development and testing with mx-tester

WARNING: mx-tester is currently work in progress, but it can still save you some time and is better than struggling with nothing.

If you have docker installed you can quickly get setup with a development environment by using
[mx-tester](https://github.com/matrix-org/mx-tester).

To use mx-tester you will need to have rust installed. You can do that at [rustup](https://rustup.rs/) or [here](https://rust-lang.github.io/rustup/installation/other.html), you should probably also check your distro's documentation first to see if they have specific instructions for installing rust.

Once rust is installed you can install mx-tester like so.

```
$ cargo install mx-tester
```

Once you have mx-tester installed you we will want to build a synapse image with synapse_antispam from the Draupnir project root.

```
$ mx-tester build
```

Then we can start a container that uses that image and the config in `mx-tester.yml`.

```
$ mx-tester up
```

Once you have called `mx-tester up` you can run the integration tests.
```
$ yarn test:integration
```

After calling `mx-tester up`, if we want to play with mojlnir locally we can run the following and then point a matrix client to http://localhost:9999.
You should then be able to join the management room at `#moderators:localhost:9999`.

```
yarn test:manual
```

Once we are finished developing we can stop the synapse container.

```
mx-tester down
```

### Running integration tests

The integration tests can be run with `yarn test:integration`.
The config that the tests use is in `config/harness.yaml`
and by default this is configured to work with the server specified in `mx-tester.yml`,
but you can configure it however you like to run against your own setup.

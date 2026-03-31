#!/bin/sh

# SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
# SPDX-FileCopyrightText: 2022 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0

# This is used as the entrypoint in the draupnir Dockerfile and convenience for from-source installations.
# This allows us to set default options for node and to switch between the appservice and bot.

# Help us normalise paths to make sure they are relative to where the script is.
draupnir_path="${0%/*}";
test x"$draupnir_path" = x"$0" && draupnir_path='.';
case "$draupnir_path" in
    [!/.]*) draupnir_path="./$draupnir_path";;
esac

case "$1" in
    bot) shift; set -- node --enable-source-maps "${draupnir_path}/apps/draupnir/dist/index.js" "$@";;
    appservice) shift; set -- node --enable-source-maps "${draupnir_path}/apps/draupnir/dist/appservice/cli.js" "$@";;
esac

# If it looks like someone is providing an executable to `docker run`, then we will execute that instead.
# This aids configuration and debugging of the image if for example node needed to be started via another method,
# Or with different options for node.
exec "$@";

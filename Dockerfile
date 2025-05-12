# Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
# Copyright 2019 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0 AND AFL-3.0

FROM node:20-slim as build-stage
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
COPY . /tmp/src
# describe the version.
RUN cd /tmp/src && git describe > version.txt.tmp && mv version.txt.tmp version.txt
# build and install
RUN cd /tmp/src \
    && yarn install --frozen-lockfile --network-timeout 100000 \
    && yarn build \
    && yarn install --frozen-lockfile --production --network-timeout 100000

FROM node:20-slim as final-stage

# We dont want to be root when running so we create a draupnir user
USER 1000:1000

COPY --from=build-stage /tmp/src/version.txt version.txt
COPY --from=build-stage /tmp/src/lib/ /draupnir/
COPY --from=build-stage /tmp/src/node_modules /node_modules
COPY --from=build-stage /tmp/src/draupnir-entrypoint.sh /
COPY --from=build-stage /tmp/src/package.json /

ENV NODE_ENV=production
ENV NODE_CONFIG_DIR=/data/config
# Set SQLite's temporary directory. See #746 for context.
ENV SQLITE_TMPDIR=/data

CMD ["bot"]
ENTRYPOINT ["./draupnir-entrypoint.sh"]
VOLUME ["/data"]

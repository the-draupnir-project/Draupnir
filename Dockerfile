# Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
# Copyright 2019 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0 AND AFL-3.0

FROM alpine/git:latest as git-stamp-stage
COPY . /tmp/src
RUN cd /tmp/src && git describe > version.txt.tmp && mv version.txt.tmp version.txt

FROM node:20-slim as build-stage
COPY . /tmp/src
COPY --from=git-stamp-stage /tmp/src/version.txt version.txt
RUN cd /tmp/src \
    && yarn install --frozen-lockfile --network-timeout 100000 \
    && yarn build \
    && yarn install --frozen-lockfile --production --network-timeout 100000

FROM node:20-slim as final-stage
COPY --from=git-stamp-stage /tmp/src/version.txt version.txt
COPY --from=build-stage /tmp/src/lib/ /draupnir/
COPY --from=build-stage /tmp/src/node_modules /node_modules
COPY --from=build-stage /tmp/src/draupnir-entrypoint.sh /
COPY --from=build-stage /tmp/src/package.json /

ENV NODE_ENV=production
ENV NODE_CONFIG_DIR=/data/config

CMD ["bot"]
ENTRYPOINT ["./draupnir-entrypoint.sh"]
VOLUME ["/data"]

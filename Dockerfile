# Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
# Copyright 2019 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0 AND AFL-3.0

# syntax=docker/dockerfile:1.7

FROM node:24-slim as build-stage
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    apt-get update \
    && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /tmp/src
COPY package.json package-lock.json ./
COPY packages/*/package.json ./packages/*/
COPY apps/*/package.json ./apps/*/

# Install dependencies first so source edits don't invalidate this layer.
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .

# build and install
RUN npm run build \
    && npm prune --production

FROM node:24-slim as final-stage
COPY --from=build-stage /tmp/src/apps/draupnir /apps/draupnir
COPY --from=build-stage /tmp/src/packages /packages
COPY --from=build-stage /tmp/src/node_modules /node_modules
COPY --from=build-stage /tmp/src/draupnir-entrypoint.sh /

ENV NODE_ENV=production
ENV NODE_CONFIG_DIR=/data/config
# Set SQLite's temporary directory. See #746 for context.
ENV SQLITE_TMPDIR=/data

CMD ["bot"]
ENTRYPOINT ["./draupnir-entrypoint.sh"]
VOLUME ["/data"]

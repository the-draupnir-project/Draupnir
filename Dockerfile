# Copyright 2024 Gnuxie <Gnuxie@protonmail.com>
# Copyright 2019 The Matrix.org Foundation C.I.C.
#
# SPDX-License-Identifier: Apache-2.0 AND AFL-3.0

# We can't use alpine anymore because crypto has rust deps.
FROM node:20-slim
COPY . /tmp/src
RUN cd /tmp/src \
    && yarn install --network-timeout 100000 \
    && yarn build \
    && mv lib/ /draupnir/ \
    && mv node_modules / \
    && mv draupnir-entrypoint.sh / \
    && mv package.json / \
    && mv version.txt / \
    && cd / \
    && rm -rf /tmp/*

ENV NODE_ENV=production
ENV NODE_CONFIG_DIR=/data/config

CMD ["bot"]
ENTRYPOINT ["./draupnir-entrypoint.sh"]
VOLUME ["/data"]

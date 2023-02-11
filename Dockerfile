# We can't use alpine anymore because crypto has rust deps.
FROM node:16-slim
COPY . /tmp/src
RUN cd /tmp/src \
    && yarn install \
    && yarn build \
    && mv lib/ /mjolnir/ \
    && mv node_modules / \
    && mv mjolnir-entrypoint.sh / \
    && mv package.json / \
    && mv version.txt / \
    && cd / \
    && rm -rf /tmp/*

ENV NODE_ENV=production
ENV NODE_CONFIG_DIR=/data/config

CMD ["bot"]
ENTRYPOINT ["./mjolnir-entrypoint.sh"]
VOLUME ["/data"]

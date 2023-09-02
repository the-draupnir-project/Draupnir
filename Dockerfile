# We can't use alpine anymore because crypto has rust deps.
FROM node:18-slim
# install git
RUN apt-get update && \
    apt-get install -y git\
    &&  rm -rf /var/lib/apt/lists/*
COPY . /tmp/src
RUN cd /tmp/src \
    && yarn install --network-timeout 100000 \
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

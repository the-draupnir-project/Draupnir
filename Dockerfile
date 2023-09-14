# We can't use alpine anymore because crypto has rust deps.
FROM --platform=$BUILDPLATFORM node:18-slim AS build
# install git
RUN apt-get update && \
    apt-get install -y git\
    &&  rm -rf /var/lib/apt/lists/*
COPY . .
RUN yarn install --network-timeout 100000 \
    && yarn build

FROM node:18-slim

COPY --from=build /lib /mjolnir
COPY --from=build /node_modules /node_modules
COPY --from=build mjolnir-entrypoint.sh .
COPY --from=build version.txt .

ENV NODE_ENV=production
ENV NODE_CONFIG_DIR=/data/config

CMD ["bot"]
ENTRYPOINT ["./mjolnir-entrypoint.sh"]
VOLUME ["/data"]

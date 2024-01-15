These instructions are to build and run draupnir without using [Docker](./setup_docker.md).
You need to have installed `yarn` 1.x and Node 18.

```bash
git clone https://github.com/the-draupnir-project/Draupnir.git
cd draupnir

yarn install
yarn build

# Copy and edit the config. It *is* recommended to change the data path,
# as this is set to `/data` by default for dockerized draupnir.
cp config/default.yaml config/production.yaml
nano config/production.yaml

node lib/index.js --draupnir-config ./config/production.yaml
```

<!--
SPDX-FileCopyrightText: 2026 Catalan Lover <catalanlover@protonmail.com>

SPDX-License-Identifier: Apache-2.0
-->

# Draupnir CI in a Box

This directory contains the so called CI in a Box. Aka Ci-Box. This provides the ability to run the same validation that the CI will run but locally
and do so without needing to worry about if your in a linux or windows based environment as long as you have the ability to run docker.

Ci in a box provides the following capabilities:

- build and lint checks
- unit tests
- bot integration tests
- appservice integration tests

The local commands intentionally mirror the CI workflow so the same setup is easier to troubleshoot and less prone to the black-box problems we had with the previous CI.

## Prerequisites

- Docker with Compose
- A local Draupnir checkout
- A local checkout of [`maunium/synapse-http-antispam`](https://github.com/maunium/synapse-http-antispam) for integration runs. (Synapse can potentially be a bit cranky even if AS doesnt need this. Thats why its a requirment for both.)

The local layout is expected to be:

```text
parent/
├── Draupnir/
├── synapse-http-antispam/
└── ...
```

`ci-in-a-box/` sits inside the Draupnir repo and should be invoked from there.

## Quick start

1. Copy the sample environment file if you want to use non-default settings:

```bash
cp .env.example .env
```

2. Review the contents of `.env` to see if your local checkouts are aligned correctly or if you need to use non defaults.

3. Run the validation command you want to exercise, for example:

```bash
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile build-lint up --build draupnir-build-lint
```

If you need to inspect the resolved Compose configuration while debugging, you can still run:

```bash
docker compose config
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile '*' config --quiet
```

## Variant selection

These files represent the supported runtime variants:

```text
compose.node24-slim.yaml
compose.node24-alpine.yaml
compose.node26-slim.yaml
compose.node26-alpine.yaml
```

Use the base Compose file together with one of the variant files when running a check:

```bash
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile build-lint up --build draupnir-build-lint
```

## Common contributor commands

Build and lint:

```bash
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile build-lint up --build draupnir-build-lint
```

Run unit tests:

```bash
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile unit up --build draupnir-unit
```

Run bot mode integration tests:

```bash
docker compose -f compose.yaml -f compose.node24-slim.yaml up -d
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile integration up --build draupnir-integration
```

Run appservice mode integration tests:

```bash
docker compose -f compose.yaml -f compose.node24-slim.yaml up -d
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile appservice-integration up --build draupnir-appservice-integration
```

Clean up after a run:

```bash
docker compose -f compose.yaml -f compose.node24-slim.yaml --profile '*' down --volumes
```

## Debian and Alpine checks

Use the variant file to switch between the Debian and Alpine validation paths:

```bash
docker compose -f compose.yaml -f compose.node24-alpine.yaml --profile unit up --build draupnir-unit
```

This keeps the glibc and musl validation paths in the same matrix, so you can compare the baseline Debian run against the Alpine target and diagnose distro-specific regressions. This layout avoids environment variables where possible, which makes it easier to work consistently across Windows and Linux hosts.

## CI parity

When changing this workflow, keep the local commands aligned with the GitHub Actions matrix. In practice, that means:

1. Use the repo-local `ci-in-a-box/` files.
2. Check out the latest `maunium/synapse-http-antispam` revision for the integration job so compatibility regressions are caught early.
3. Run the same Compose commands locally that the workflow runs in CI.
4. Keep the cleanup step consistent with `down --volumes` after failures or successful runs.

This keeps the contributor workflow reproducible and makes CI failures easier to diagnose from the same commands.

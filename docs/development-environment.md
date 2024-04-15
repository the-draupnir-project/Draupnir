# Developing Draupnir - tests, tools, and environment

This document is a part of our [contributing documentation](../CONTRIBUTING.md)
and describes how to setup a development environment that we to develop
Draupnir. If you already have your own workflow for typescript projects,
you should still read this document to spot any caveats that might
require you to adapt for our recommendations.

## matrix-protection-suite

While not necessary, some changes will require you to make changes to the
[matrix-protection-suite](https://github.com/Gnuxie/matrix-protection-suite)
and the associated backend for the matrix-bot-sdk: [matrix-protection-suite-for-matrix-bot-sdk](https://github.com/Gnuxie/matrix-protection-suite-for-matrix-bot-sdk).

You should clone these locally and then link them by using
`yarn link` in each directory followed by `yarn link matirx-protection-suite matrix-protection-suite-for-matrix-bot-sdk` within Draupnir.

You may also need to `yarn add --dev "matrix-bot-sdk@npm:@vector-im/matrix-bot-sdk@^0.6.6-element.1"`
within the `matrix-protection-suite-for-matrix-bot-sdk` directory to ensure
that that the local copy is using the same version as Draupnir.
I don't understand why `yarn` will not respect overrides for linked
dependencies.

### VSCode

You will also want to edit your `settings.json` to match something like
this, so that you can debug into MPS while debugging Draupnir.

```
    "debug.javascript.terminalOptions": {
        "runtimeArgs": ["--preserve-symlinks"],
        "sourceMaps": true,
        "outFiles": [
            "${userHome}/experiments/draupnir/lib/**/*.js",
            "${userHome}/experiments/draupnir/src/**/*.ts",
            "${userHome}/experiments/draupnir/test/**/*.ts",
            "${userHome}/experiments/matrix-protection-suite/dist/**/*.js",
            "${userHome}/experiments/matrix-protection-suite/src/**/*.ts",
            "${userHome}/experiments/matrix-protection-suite-for-matrix-bot-sdk/dist/**/*.js",
            "${userHome}/experiments/matrix-protection-suite-for-matrix-bot-sdk/src/**/*.ts",
          ]
    }
```

## mx-tester

For integration testing, and spinning up a local synapse we use
[mx-tester](https://github.com/matrix-org/mx-tester).
While not required for basic changes, it is strongly recommended
to use mx-tester or have the ability to spin up your own
development Synapse to develop mjolnir interactively.

To install `mx-tester` you will need the [rust toolchain](https://rustup.rs/)
and Docker. You should refer to your linux distribution's documentation
for installing both, and do not naively follow the instructions
from rustup.rs without doing so first.
Then you will be able to install `mx-tester` with `cargo install mx-tester`.
Updating mx-tester can be done by installing `cargo install cargo-update`
and using `cargo install-update mx-tester`, though you may skip
this step until it is necessary to update `mx-tester`.

### Usage

You can then start a local synapse using `mx-tester build`,
followed by `mx-tester up`. You can then use `up`, `down` as many
times as you like.
If for some reason you need to get a clean Synapse database,
you can just use `mx-tester down build`.

## Debugging

For debugging mx-tester it is recommended to use Visual Studio Code.
If you open the project in visual studio code, press `F1`,
type `Debug: JavaScript Debug Terminal`
(see the [documentation](https://code.visualstudio.com/docs/nodejs/nodejs-debugging#_javascript-debug-terminal)),
and you should get a terminal from which node will always connect to
Visual Studio Code.

The following sections assume that a Synapse is running
and `config/harness.yaml` has been configured to connect to it.
If you are using `mx-tester` and you use `mx-tester up`, this will
already be the case.

### Debugging and reproducing an issue

If you need to debug an issue that is occurring through use in matrix,
say the unban command has stopped working, you can launch
mjolnir from the JavaScript Debug Terminal using `yarn test:manual`.
This will launch mjolnir using the config found in `config/harness.yaml`.
You can now open https://app.element.io, change the server to `localhost:8081`,
and then create an account.
From here you can join the room `#moderators:localhost:9999` (you will also be
able to find it in the rooms directory) and interact with mjolnir.

It is recommended to set breakpoints in the editor while interacting
and switch the tab to "DEBUG CONSOLE" (within Visual Studio Code)
to evaluate arbitrary expressions in the currently paused context (when
a breakpoint has been hit).

### Debugging an integration test

To debug the integration test suite from the JavaScript Debug Terminal,
you can start them using `yarn test:integration`.
However, more often than not there is a specific section of
code you will be working on that has specific tests. Running
the entire suite is therefore unnecessary.
To run a specific test from the JavaScript Debug Terminal,
you can use the script `yarn test:integration:single test/integration/banListTest.ts`,
where `test/integration/banListTest.ts` is the name of the integration test you
want to run.

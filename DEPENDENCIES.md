# Dependencies

## Pinned dependencies

### @vector-im/matrix-bot-sdk

This is pinned and overridden because we need to have the exact same version for
all dependencies. As we create and pass `MatrixClient` through Draupnir,
matrix-protection-suite-for-matrix-bot-sdk, the vector bot-sdk fork itself, and
also matrix-appservice-bridge.

### postgres

https://github.com/porsager/postgres/issues/1143

This is pinned specifically as a work around for this issue.

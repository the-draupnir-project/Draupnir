// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

const tsAutoMockTransformer = require("ts-auto-mock/transformer").default;
require("ts-node").register({
  project: "./tsconfig.json",
  transformers: (program) => ({
    before: [tsAutoMockTransformer(program)],
  }),
});

// Mocha apparently suppresses unhandled rejections for some crazy reason??
process.on("unhandledRejection", (reason) => {
  throw reason;
});

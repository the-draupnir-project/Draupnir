// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: CC0-1.0

const tsAutoMockTransformer = require("ts-auto-mock/transformer").default;
require("ts-node").register({
  project: "./tsconfig.json",
  transformers: (program) => ({
    before: [tsAutoMockTransformer(program)],
  }),
});

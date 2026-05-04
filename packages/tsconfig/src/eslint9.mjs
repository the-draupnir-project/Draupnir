// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: Apache-2.0

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import tsplugin from "@typescript-eslint/eslint-plugin";

// this configuration file stilli includes random shite from these directories
// and I do not understand why. It is one of the most frustraiting things
// my guess is that there is some hidden ambient config that is included
// full of eslint defaults that we can't intercept??
// I don't know, but it's one of the most frustraiting things ever.
const ignores = [
  "**/docs/**",
  "**/.husky/**",
  "**/coverage/**",
  "**/dist/**",
  "**/lib/**",
];

export default tseslint.config({
  // This is a typescript-eslint configurartion for typescript files.
  // This will not work against js files.
  files: [
    "packages/**/src/**/*.ts",
    "packages/**/src/**/*.tsx",
    "packages/**/test/**/*.ts",
    "packages/**/test/**/*.tsx",
    "apps/**/src/**/*.ts",
    "apps/**/src/**/*.tsx",
    "apps/**/test/**/*.ts",
    "apps/**/test/**/*.tsx",
    "src/**/*.ts",
    "src/**/*.tsx",
    "test/**/*.ts",
    "test/**/*.tsx",
  ],
  extends: [eslint.configs.recommended, ...tseslint.configs.strictTypeChecked],
  languageOptions: {
    parserOptions: {
      projectService: true,
    },
  },
  // This is needed in order to specify the desired behavior for its rules
  plugins: {
    "@typescript-eslint": tsplugin,
  },
  rules: {
    // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
    // e.g. "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
    ],
    // we implement a lot of interfaces that return promises with synchronous functions.
    "require-await": "off",
    "@typescript-eslint/require-await": "off",
    // we need never because our code can be wrong!
    "@typescript-eslint/restrict-template-expressions": [
      "error",
      { allowNever: true },
    ],
    // stylistic recommendation that doesn't play well with event emitter interfaces.
    "@typescript-eslint/unified-signatures": "off",
    // There are some compelling arguments for including this rule,
    // but other than using namespaces, we don't have granular enough modules
    // to be able to depend on their behaviour. This should be revisited.
    "@typescript-eslint/no-extraneous-class": "off",
    // We want to be able to create infinite loops.
    "@typescript-eslint/no-unnecessary-condition": [
      "error",
      { allowConstantLoopConditions: true },
    ],
    // This rule is unstable as hell and tries to apply itself to interfaces.
    "@typescript-eslint/no-unnecessary-type-parameters": "off",
  },
  ignores: [...ignores, "**/*.js", "**/*.jsx"],
});

// SPDX-FileCopyrightText: 2024 Gnuxie <Gnuxie@protonmail.com>
//
// SPDX-License-Identifier: CC0-1.0


import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import tsplugin from "@typescript-eslint/eslint-plugin";

// this configuration file stilli includes random shite from these directories
// and I do not understand why. It is one of the most frustraiting things
// my guess is that there is some hidden ambient config that is included
// full of eslint defaults that we can't intercept??
// I don't know, but it's one of the most frustraiting things ever.
const ignores = ['**/docs/**', '**/.husky/**', '**/coverage/**', '**/dist/**', '**/lib/**'];

const rulesFromMPS = {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // we implement a lot of interfaces that return promises with synchronous functions.
    "require-await": "off",
    "@typescript-eslint/require-await": "off",
    // we need never because our code can be wrong!
    "@typescript-eslint/restrict-template-expressions": ['error', { allowNever: true }],
    // stylistic recommendation that doesn't play well with event emitter interfaces.
    "@typescript-eslint/unified-signatures": "off",
    // There are some compelling arguments for including this rule,
    // but other than using namespaces, we don't have granular enough modules
    // to be able to depend on their behaviour. This should be revisited.
    "@typescript-eslint/no-extraneous-class": "off",
    // We want to be able to create infinite loops.
    "@typescript-eslint/no-unnecessary-condition": ['error', { allowConstantLoopConditions: true }],
}

export default tseslint.config({
    // This is a typescript-eslint configurartion for typescript files.
    // This will not work against js files.
    files: [
        "src/**/*.ts",
        "src/**/*.tsx",
        "test/**/*.ts",
        "test/**/*.tsx"
    ],
    extends: [
        eslint.configs.recommended,
        ...tseslint.configs.strictTypeChecked,
    ],
    languageOptions: {
        parserOptions: {
        project: ["./tsconfig.json", "./test/tsconfig.json"],
        },
    },
    // This is needed in order to specify the desired behavior for its rules
    plugins: {
        '@typescript-eslint': tsplugin,
    },
    rules: {
        // Place to specify ESLint rules. Can be used to overwrite rules specified from the extended configs
        // e.g. "@typescript-eslint/explicit-function-return-type": "off",
        ...rulesFromMPS,

        // There is too much ambient `any` from the `matrix-bot-sdk` in our project to be able to use no-unsafe-*.
        // We would really love to be able to set this to `error`.
        "@typescript-eslint/no-unsafe-argument": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/no-unsafe-call": "off",

        // We make the mistake of using `unknown` for caught and wrapped exceptions
        // in matrix-protection-suite...
        // which causes problems when we unwrap them.
        // We should probably change `Result` to throw when exception doesn't
        // implement error.
        "@typescript-eslint/only-throw-error": "off",

        "@typescript-eslint/unbound-method": ["error", { ignoreStatic: true }],

        "no-constant-condition": ["error", { checkLoops: "allExceptWhileTrue" },]
    },
    ignores: [...ignores, '**/*.js', '**/*.jsx'],
});

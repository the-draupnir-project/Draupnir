module.exports = {
    "env": {
        "browser": false,
        "es6": true,
        "node": true
    },
    "parser": "@typescript-eslint/parser",
    "parserOptions": {
        "project": "tsconfig.json",
        "sourceType": "module"
    },
    "plugins": [
        "@typescript-eslint"
    ],
    "root": true,
    "rules": {
        "@typescript-eslint/member-ordering": [
            "error",
            {
                "default": [
                    "public-instance-method",
                    "public-static-field"
                ]
            }
        ],
        "@typescript-eslint/no-inferrable-types": "error",
        "@typescript-eslint/no-shadow": "error",
        "@typescript-eslint/no-unused-expressions": "error",
        "@typescript-eslint/type-annotation-spacing": "error",
        "brace-style": [
            "error",
            "1tbs"
        ],
        "eqeqeq": [
            "error",
            "always"
        ],
        "no-caller": "error",
        "no-debugger": "error",
        "no-eval": "error",
        "no-fallthrough": "error",
        "no-new-wrappers": "error",
        "no-redeclare": "error",
        "no-trailing-spaces": "error",
        "no-unused-labels": "error",
        "no-var": "error",
        "radix": "error"
    }
};

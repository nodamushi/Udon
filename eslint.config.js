// @ts-check
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

/** @type {import("eslint").Linter.Config[]} */
module.exports = [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 6,
        sourceType: "module",
        // Enable typed linting required for type-aware rules
        // such as @typescript-eslint/only-throw-error.
        project: true,
        tsconfigRootDir: __dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          "selector": "default",
          "format": ["camelCase", "UPPER_CASE"],
        },
        {
          // Classes, interfaces, type aliases, enums: PascalCase (TypeScript convention)
          "selector": "typeLike",
          "format": ["PascalCase"],
        },
        {
          // Imports: allow PascalCase to accommodate library naming conventions
          "selector": "import",
          "format": ["camelCase", "PascalCase", "UPPER_CASE"],
        },
        {
          // Keys containing hyphens, dots, etc. ("linux-arm64", ".jpg", ...)
          // are not valid identifiers, so skip naming-convention for them
          "selector": "objectLiteralProperty",
          "format": null,
          "filter": {
            "regex": "[^a-zA-Z0-9_$]",
            "match": true,
          },
        },
      ],
      // @typescript-eslint/semi was removed in v8; use the native semi rule instead.
      "semi": "warn",
      "curly": "warn",
      "eqeqeq": "warn",
      // TypeScript-aware replacement for no-throw-literal (requires typed linting)
      "@typescript-eslint/only-throw-error": "warn",
    },
  },
];

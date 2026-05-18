import eslint from "@eslint/js";
import { meta as tseslint } from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import { Config, defineConfig, globalIgnores } from "eslint/config";
import jsdoc from "eslint-plugin-jsdoc";
import prettier from "eslint-plugin-prettier";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import unusedImports from "eslint-plugin-unused-imports";

const base: Config["rules"] = {
  "import/extensions": "off",
  "no-param-reassign": "off",
  "no-underscore-dangle": "off",
  "prettier/prettier": ["error", { singleQuote: false, endOfLine: "auto" }],
};

const ts: Config["rules"] = {
  "@typescript-eslint/array-type": "off",
  "@typescript-eslint/ban-ts-comment": "off",
  "@typescript-eslint/ban-tslint-comment": "off",
  "@typescript-eslint/class-literal-property-style": "off",
  "@typescript-eslint/consistent-generic-constructors": "off",
  "@typescript-eslint/consistent-indexed-object-style": "off",
  "@typescript-eslint/consistent-type-definitions": "off",
  "@typescript-eslint/no-empty-function": "off",
  "@typescript-eslint/no-empty-interface": "off",
  "@typescript-eslint/no-empty-object-type": "off",
  "@typescript-eslint/no-explicit-any": "off",
  "@typescript-eslint/no-inferrable-types": "off",
  "@typescript-eslint/no-namespace": "off",
  "@typescript-eslint/no-shadow": "off",
  "@typescript-eslint/no-this-alias": "off",
  "@typescript-eslint/no-unused-vars": "off",
  "@typescript-eslint/no-unused-expressions": "off",
  "@typescript-eslint/no-wrapper-object-types": "off",
  "@typescript-eslint/triple-slash-reference": "off",
};

const others: Config["rules"] = {
  "no-restricted-syntax": [
    "error",
    "ForInStatement",
    "LabeledStatement",
    "WithStatement",
  ],
  "import/order": "off",
  "import/refer-default-export": "off",
  "simple-import-sort/imports": "error",
  "simple-import-sort/exports": "error",
  "unused-imports/no-unused-imports": "error",
  "unused-imports/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
  "consistent-return": "off",

  "jsdoc/require-description-complete-sentence": "warn",
  "jsdoc/require-asterisk-prefix": "warn",
  "jsdoc/sort-tags": "warn",
};

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/coverage/**",
    "**/docs/**",
    "packages/js/__mocks__/**",
    "packages/ts/__mocks__/**",
  ]),
  {
    files: ["**/*.{js,ts}"],
    ...eslint.configs.recommended,
    ...jsdoc.configs["flat/recommended-typescript"],
    plugins: {
      jsdoc,
      prettier,
      "@typescript-eslint": tseslint,
      "unused-imports": unusedImports,
      "simple-import-sort": simpleImportSort,
    },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    rules: { ...base, ...ts, ...others },
  },
]);

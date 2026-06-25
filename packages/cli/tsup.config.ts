import { defineConfig, type Options } from "tsup";

const options: Options = {
  clean: true,
  dts: false,
  entry: ["src/letant.ts"],
  format: "cjs",
  minify: false,
  target: ["node22", "node24", "node25"],
  external: [
    "letant",
    "tree-sitter",
    "commander",
    "@commander-js/extra-typings",
  ],
  sourcemap: false,
};

export default defineConfig(options);

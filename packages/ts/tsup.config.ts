import { scmPlugin } from "letant/query";
import { defineConfig, type Options } from "tsup";

const options: Options = {
  clean: true,
  dts: false,
  entry: ["src/index.ts"],
  esbuildPlugins: [scmPlugin],
  minify: false,
  target: ["node22", "node24", "node25"],
  external: ["letant", "tree-sitter-javascript"],
  sourcemap: false,
};

export default defineConfig([
  { ...options, format: "cjs" },
  { ...options, format: "esm" },
  {
    ...options,
    clean: false,
    dts: { only: true },
    format: ["esm", "cjs"],
    outExtension: ({ format }) => ({
      dts: format === "cjs" ? ".d.ts" : ".d.mts",
    }),
  },
]);

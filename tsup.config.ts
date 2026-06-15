import { defineConfig, type Options } from "tsup";

const entry: string[] = [
  "src/index.ts",
  "src/config/index.ts",
  "src/dot/index.ts",
  "src/utils/index.ts",
  "src/utils/query/index.ts",
];

const jsOptions: Options = {
  clean: true,
  dts: false,
  entry,
  splitting: false,
  treeshake: true,
  minify: true,
  target: ["node22", "node24", "node25"],
  sourcemap: false,
};

export default defineConfig([
  {
    ...jsOptions,
    format: "esm",
    outExtension: () => ({ js: ".mjs" }),
  },
  {
    ...jsOptions,
    format: "cjs",
  },
  // Single DTS build from the root entry only.
  // All types used in exposed sub-modules should be re-exported from src/index.ts.
  {
    clean: false,
    dts: { only: true },
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    outExtension: ({ format }) => ({
      dts: format === "cjs" ? ".d.ts" : ".d.mts",
    }),
    splitting: false,
    target: ["node22", "node24", "node25"],
  },
]);

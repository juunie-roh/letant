import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    setupFiles: ["src/__mocks__/setup.ts"],
    include: [
      "src/**/*.(test|spec).*",
      "packages/cli/src/**/*.(test|spec).*",
      "packages/js/src/**/*.(test|spec).*",
      "packages/python/src/**/*.(test|spec).*",
      "packages/ts/src/**/*.(test|spec).*",
    ],
    exclude: ["**/node_modules/**", "**/__snapshots__/**"],
    environment: "node",
    coverage: {
      include: ["src/**"],
      exclude: [
        "**/index.*",
        "**/__mocks__/**",
        "**/*.test.*",
        "**/types.ts",
        "**/models/**",
        "**/error.ts",
        "**/*.d.ts",
        "**/.DS_Store",
        "**/*.md",
      ],
    },
  },
});

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
      "packages/cli/**/*.(test|spec).*",
      "packages/js/**/*.(test|spec).*",
      "packages/python/**/*.(test|spec).*",
      "packages/ts/**/*.(test|spec).*",
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

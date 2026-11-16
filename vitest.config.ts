import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "core",
          setupFiles: ["src/__mocks__/setup.ts"],
          include: [
            "src/**/*.(test|spec).*",
            "packages/cli/**/*.(test|spec).*",
          ],
          exclude: ["**/node_modules/**", "**/__snapshots__/**"],
          environment: "node",
        },
      },
      // each plugin owns its test environment
      "packages/*/vitest.config.ts",
    ],
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

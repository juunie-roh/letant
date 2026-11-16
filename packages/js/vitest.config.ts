import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "js",
    include: ["__tests__/**/*.(test|spec).*"],
    exclude: ["**/node_modules/**", "**/__snapshots__/**"],
    environment: "node",
  },
});

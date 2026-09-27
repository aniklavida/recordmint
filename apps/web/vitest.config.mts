import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/.git/**"],
    // Test files share one live Postgres-backed pg-boss instance and queue
    // names; running files in parallel races on queue creation/state.
    fileParallelism: false,
  },
});

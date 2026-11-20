import { realpathSync } from "node:fs";
import path from "node:path";

import { defineConfig } from "vitest/config";

// Canonical on-disk path: on Windows the same folder can be reached with different letter case,
// which would load two copies of vitest.
const root = realpathSync.native(import.meta.dirname);

export default defineConfig({
  root,
  resolve: {
    alias: {
      "@ai/contracts": path.join(root, "docs/ai/contracts/ai-contracts.ts"),
      "@": path.join(root, "src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: [path.join(root, "vitest.setup.ts")],
    include: ["src/**/*.test.{ts,tsx}"],
    restoreMocks: true,
  },
});

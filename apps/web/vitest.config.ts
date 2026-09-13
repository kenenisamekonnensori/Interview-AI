import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * The application imports its own modules through the `@/` path alias. The
 * TypeScript compiler reads that mapping from `tsconfig.json`, but the test
 * runner resolves imports itself, so the same alias is declared here.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});

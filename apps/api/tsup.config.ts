import { defineConfig } from "tsup";

/**
 * Workspace packages (@interviewer-ai/*) export raw TypeScript sources and have
 * no build step of their own. `tsx` handles that in development, but plain
 * `node dist/server.js` cannot resolve `./foo.js` specifiers inside `.ts`
 * sources — so the production bundle must inline them instead of leaving them
 * external. Real npm dependencies (fastify, prisma, paddle, ...) stay external
 * and are resolved from node_modules at runtime.
 */
const workspacePackages = /^@interviewer-ai\//;

export default defineConfig({
  entry: [
    "src/server.ts",
    "src/workers/auth-email.worker.ts",
    "src/workers/career-analysis.worker.ts",
    "src/workers/report.worker.ts",
    "src/workers/billing.worker.ts",
  ],
  format: ["esm"],
  target: "node22",
  clean: true,
  sourcemap: true,
  splitting: true,
  external: ["dotenv", "dotenv/config"],
  noExternal: [workspacePackages],
});

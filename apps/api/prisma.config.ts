import { config } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { defineConfig, env } from "prisma/config";

// config({ path: resolve(import.meta.dirname, "../../.env") });
const envPath = resolve(import.meta.dirname, "../../.env");

if (existsSync(envPath)) {
  config({ path: envPath });
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

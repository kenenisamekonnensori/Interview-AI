import { resolve } from "node:path";

if (process.env.NODE_ENV !== "production") {
  process.env.DOTENV_CONFIG_PATH ??= resolve(import.meta.dirname, "../../../.env");
  await import("dotenv/config");
}

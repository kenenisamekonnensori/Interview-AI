import { resolve } from "node:path";
import dns from "node:dns";
import dotenv from "dotenv";

// Ensure Node.js prioritizes IPv4 over IPv6 for outbound HTTP/fetch requests.
// This prevents ETIMEDOUT when external APIs (such as Google OAuth) return dual-stack DNS
// entries on systems where IPv6 routes are advertised by DNS but unreachable or drop packets.
dns.setDefaultResultOrder("ipv4first");

if (process.env.NODE_ENV !== "production") {
  const envPath = process.env.DOTENV_CONFIG_PATH ?? resolve(import.meta.dirname, "../../../.env");
  dotenv.config({ path: envPath });
}

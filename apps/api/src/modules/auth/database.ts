import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../prisma/generated/client.js";

export function createAuthDatabase(databaseUrl: string) {
  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  return new PrismaClient({ adapter });
}

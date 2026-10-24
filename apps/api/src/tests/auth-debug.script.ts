import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";
import { PrismaClient } from "../../prisma/generated/client.js";

config({ path: process.cwd() + "/../../.env" });

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 30_000,
  max: 10,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  const sessions = await prisma.session.findMany({
    orderBy: { createdAt: "desc" as const },
    take: 3,
    select: { id: true, token: true, expiresAt: true, userId: true },
  });
  console.log(
    "latest sessions:",
    sessions.map((s) => ({
      id: s.id,
      token: `${s.token.slice(0, 10)}…${s.token.slice(-8)}`,
      tokenMatch: s.token.startsWith("7539771ed07caf2d7b95aa43ac4984fc2eadefd3334b651f"),
      expiresAt: s.expiresAt,
    })),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

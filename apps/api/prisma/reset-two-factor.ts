/**
 * Emergency recovery: removes two-factor authentication from one account.
 *
 *   pnpm --filter @schoolhub/api reset-2fa user@example.com
 *
 * For a super-admin who has lost both their authenticator and backup codes.
 * Requires shell access to the server (i.e. database credentials), which is
 * the trust boundary. Ends all of the account's sessions and writes an audit
 * entry. The person must sign in with their password and enrol again.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !email.includes("@")) {
  console.error("Usage: pnpm --filter @schoolhub/api reset-2fa <email>");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true, twoFactorEnabled: true },
  });
  if (!user) throw new Error(`No account found for ${email}`);

  await prisma.$transaction([
    prisma.twoFactor.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: { twoFactorEnabled: false } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
    prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "ACCESS_CHANGED",
        entityType: "cli.two-factor.reset",
        entityId: user.id,
        oldValues: { twoFactorEnabled: user.twoFactorEnabled },
        newValues: { twoFactorEnabled: false },
      },
    }),
  ]);
  console.log(`Two-factor authentication removed for ${email}. They must sign in and set it up again.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

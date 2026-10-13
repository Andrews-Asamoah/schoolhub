import { config } from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Load .env from repo root before importing Prisma
const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { generateId } from "better-auth";
import { hashPassword } from "better-auth/crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const SUPER_ADMIN_EMAIL = "orion@schoolhub.gh";
  const SUPER_ADMIN_PASSWORD = "3Vpanw6@...";
  const SUPER_ADMIN_NAME = "SchoolHub Admin";

  // Check if superAdmin already exists (idempotent)
  const existing = await prisma.user.findUnique({
    where: { email: SUPER_ADMIN_EMAIL },
  });

  if (existing) {
    const credentialAccount = await prisma.account.findFirst({
      where: {
        userId: existing.id,
        providerId: "credential",
      },
    });

    if (credentialAccount && credentialAccount.accountId !== existing.id) {
      await prisma.account.update({
        where: { id: credentialAccount.id },
        data: {
          accountId: existing.id,
          updatedAt: new Date(),
        },
      });
      console.log("SuperAdmin credential account repaired.");
      return;
    }

    console.log("SuperAdmin already exists — skipping seed.");
    return;
  }

  const userId = generateId();
  const accountId = generateId();
  const hashedPassword = await hashPassword(SUPER_ADMIN_PASSWORD);
  const now = new Date();

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        name: SUPER_ADMIN_NAME,
        email: SUPER_ADMIN_EMAIL,
        emailVerified: true,
        role: "superAdmin",
        createdAt: now,
        updatedAt: now,
      },
    }),
    prisma.account.create({
      data: {
        id: accountId,
        accountId: userId,
        providerId: "credential",
        userId,
        password: hashedPassword,
        createdAt: now,
        updatedAt: now,
      },
    }),
  ]);

  console.log(`✅ SuperAdmin created: ${SUPER_ADMIN_EMAIL}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });

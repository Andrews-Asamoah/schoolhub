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
  // Credentials come from the environment (a secret manager in production),
  // never from source control. See .env.example.
  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
  const SUPER_ADMIN_NAME = process.env.SUPER_ADMIN_NAME?.trim() || "SchoolHub Admin";

  if (!SUPER_ADMIN_EMAIL || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(SUPER_ADMIN_EMAIL)) {
    throw new Error("Set SUPER_ADMIN_EMAIL to a valid email address before seeding.");
  }
  if (
    !SUPER_ADMIN_PASSWORD ||
    SUPER_ADMIN_PASSWORD.length < 14 ||
    !/[a-z]/.test(SUPER_ADMIN_PASSWORD) ||
    !/[A-Z]/.test(SUPER_ADMIN_PASSWORD) ||
    !/[0-9]/.test(SUPER_ADMIN_PASSWORD)
  ) {
    throw new Error(
      "Set SUPER_ADMIN_PASSWORD to at least 14 characters with upper-case, lower-case and a number.",
    );
  }

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
        // The bootstrap password has been seen by whoever ran the seed.
        mustChangePassword: true,
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

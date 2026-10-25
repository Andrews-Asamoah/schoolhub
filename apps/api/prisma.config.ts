import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: "../../.env" });

// Prisma Client generation does not connect to the database. Keep CLI
// code-generation/typecheck commands usable in fresh environments without a
// local .env file; the running API still requires DATABASE_URL to connect.
const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/schoolhub?schema=public";

export default defineConfig({
  schema: "prisma/schema",
  migrations: { path: "prisma/migrations" },
  datasource: { url: databaseUrl },
});

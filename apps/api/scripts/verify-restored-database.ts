/** Read-only recovery comparison. Freeze source writes at the backup boundary first. */
import "../src/load-env.js";
import { Pool, type PoolClient } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { FinanceLedgerIntegrityService } from "../src/modules/finance/finance-ledger-integrity.service.js";

const sourceUrl = process.env.DATABASE_URL;
const restoredUrl = process.env.RESTORE_DATABASE_URL;
let restoredName = "";
try { restoredName = new URL(restoredUrl ?? "").pathname; } catch { /* Reject invalid URLs without printing credentials. */ }
if (!sourceUrl || !restoredUrl || sourceUrl === restoredUrl || !/restore|test/i.test(restoredName)) {
  throw new Error("Set DATABASE_URL and a distinct RESTORE_DATABASE_URL whose database name contains restore or test.");
}
const source = new Pool({ connectionString: sourceUrl, max: 1, connectionTimeoutMillis: 10_000 });
const restored = new Pool({ connectionString: restoredUrl, max: 1, connectionTimeoutMillis: 10_000 });
const targetPrisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: restoredUrl }) });
// Identifiers are constant, never interpolated from user input.
const schoolTables = ["students", "payments", "bills", "transactions", "chart_accounts", "finance_journal_entries", "report_card_versions", "internal_mock_reports", "documents"];
const globalTables = ["schools", "users", "user_profiles", "finance_journal_lines", "bill_items", "payment_items"];
const mismatches: Array<{ table: string; reason: string }> = [];
const started = Date.now();
let left: PoolClient | undefined;
let right: PoolClient | undefined;
try {
  left = await source.connect();
  right = await restored.connect();
  const identityQuery = "SELECT current_database() AS name, pg_postmaster_start_time()::text AS started";
  const [sourceIdentity, targetIdentity] = await Promise.all([left.query(identityQuery), right.query(identityQuery)]);
  if (JSON.stringify(sourceIdentity.rows) === JSON.stringify(targetIdentity.rows)) throw new Error("Source and restored database resolve to the same instance");
  for (const connection of [left, right]) {
    await connection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await connection.query("SET LOCAL statement_timeout = '60s'");
    await connection.query("SET LOCAL timezone = 'UTC'");
  }
  for (const connection of [left, right]) {
    const unfinished = await connection.query('SELECT COUNT(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL AND rolled_back_at IS NULL');
    if (unfinished.rows[0]?.count) mismatches.push({ table: "_prisma_migrations", reason: "Unfinished migration present" });
  }
  const sourceMigrations = await left.query('SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');
  const targetMigrations = await right.query('SELECT migration_name, checksum FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');
  if (JSON.stringify(sourceMigrations.rows) !== JSON.stringify(targetMigrations.rows)) mismatches.push({ table: "_prisma_migrations", reason: "Migration names/checksums differ" });
  for (const name of [...schoolTables, ...globalTables]) {
    const perSchool = schoolTables.includes(name);
    const query = `SELECT ${perSchool ? '"schoolId",' : ''} COUNT(*)::text AS count, md5(COALESCE(string_agg(md5(to_jsonb(t)::text), '' ORDER BY id), '')) AS fingerprint FROM "${name}" t ${perSchool ? 'GROUP BY "schoolId" ORDER BY "schoolId"' : ''}`;
    const [a, b] = await Promise.all([left.query(query), right.query(query)]);
    if (JSON.stringify(a.rows) !== JSON.stringify(b.rows)) mismatches.push({ table: name, reason: "Row counts or data fingerprints differ" });
  }
  await left.query("COMMIT"); await right.query("COMMIT");
  const integrity = new FinanceLedgerIntegrityService({ client: targetPrisma } as never);
  const ledger = await integrity.checkAllSchools();
  if (ledger.failing.length) mismatches.push({ table: "ledger", reason: `${ledger.failing.length} school ledger integrity checks failed` });
  if (!ledger.schoolsChecked) mismatches.push({ table: "schools", reason: "No schools restored; this is not a representative recovery drill" });
  console.log(JSON.stringify({ status: mismatches.length ? "FAIL" : "PASS", scope: "DATABASE_ONLY", comparedTables: schoolTables.length + globalTables.length,
    schoolsChecked: ledger.schoolsChecked, elapsedMs: Date.now() - started, mismatches, objectStorage: "NOT_VERIFIED", productionRecoverySignoff: false }, null, 2));
  if (mismatches.length) process.exitCode = 1;
} catch {
  console.error("Restore verification could not complete. Check isolated restore connectivity, schema and the source write-freeze boundary.");
  process.exitCode = 1;
} finally {
  if (left) { await left.query("ROLLBACK").catch(() => {}); left.release(); }
  if (right) { await right.query("ROLLBACK").catch(() => {}); right.release(); }
  await Promise.all([source.end(), restored.end(), targetPrisma.$disconnect()]);
}

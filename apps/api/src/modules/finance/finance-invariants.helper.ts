import type { FinanceLedgerIntegrityService } from "./finance-ledger-integrity.service.js";

/**
 * Executable invariants for finance tests. Call at the end of every finance integration spec:
 *   await assertInvariants(integrity, school.id);
 * Later phases add their checks inside FinanceLedgerIntegrityService, so every spec that
 * already calls this helper picks them up automatically.
 */
export async function assertInvariants(integrity: Pick<FinanceLedgerIntegrityService, "check">, schoolId: string) {
  const report = await integrity.check(schoolId);
  const failures = Object.entries(report)
    .filter(([, value]) => typeof value === "object" && value !== null && "status" in value && (value as { status: string }).status !== "PASS")
    .map(([id, value]) => ({ id, value }));
  if (failures.length) {
    throw new Error(`Ledger invariants failed for school ${schoolId}: ${JSON.stringify(failures)}`);
  }
  return report;
}

# Finance P4 — periods, close checks, snapshots and audit trail

## Dependency
P4 depends on approved P0/P2/P3 posting, I1–I5, deferred revenue reconciliation, bank reconciliations (P5) and payroll remittance controls (P6). Current main has a legacy FinancePeriodLock but not P2 journal immutability, P3 adjustment posting or P5 reconciling accounts. Do not label a lock as a defensible accounting close.

## Rollout (expand, verify, contract)
1. Create effective dates and per-school period rows (month, term, year), close preparation runs and checks, versioned snapshots, and append-only period events.
2. Expose a read-only readiness checklist and persist preparation results; explicitly fail when dependency gates cannot pass, no bypass on warnings.
3. Once P2/P3/P5/P6 gates are green, add submit/independent approval using FinanceApprovalService, transactionally persist journal-derived snapshot lines and hash with CLOSED transition.
4. Replace legacy FinancePeriodLock with a derived contiguous-closed-through value after a compatibility release. Journal changes in a closed period will never be permitted; amendments use first open period with adjustsPeriodId.
5. Add separate independent approval to reopen latest period, preserve snapshot versions and append PeriodEvent.
6. Include I6/I10 in nightly invariant suite and complete pilot school-close rehearsals.

## Exit gate — pending
Month closing fails for any blocking condition; closed snapshots hash consistently and are immutable; reopening latest period creates version 2 while preserving version 1; as-original and as-adjusted reporting tie out.

## Compatibility
Legacy period-lock API remains in place for existing schools, not a substitute for P4 approved closes. P4 readiness APIs never mutate ledgers or change the lock. Migration creates new tables only. Rollback before any P4 close is to drop new tables and enums, keeping the legacy lock untouched.

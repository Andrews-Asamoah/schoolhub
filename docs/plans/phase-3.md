# Phase 3 Plan — Configurable Payroll Statutory Engine

**Branch:** phase-3/configurable-payroll-statutory-engine  
**Base:** main at ba737d3f893478672c76d310151a784351387064  
**Status:** Decisions confirmed; implementation may proceed on the feature branch. Verification is still required before phase completion.

## Goal

Replace payroll's hard-coded 2026 PAYE and SSNIT calculations with effective-dated, school-scoped, approval-controlled statutory settings. Add decimal-only calculation, payslip line snapshots, staff self-service restricted to the employee's own approved/paid payslips, and accountant/approver settings UI. Preserve all existing finance safeguards.

## Implementation sequence

1. **Baseline and map current behavior**
   - Inspect Prisma staff, school, payroll, account, audit and membership models; current payroll generation/approval/payment flow; role guards and actual membership-role source; 2FA/step-up patterns; staff identity relations; routing/navigation conventions.
   - Record existing payroll calculation behavior and capture anonymized legacy fixtures for migration parity.
   - Run baseline pnpm typecheck, pnpm --filter @schoolhub/api lint, and pnpm --filter @schoolhub/api test; record pre-existing failures separately.

2. **Plan and schema**
   - Add apps/api/prisma/schema/payroll.prisma with effective-dated tax schedules/bands, contribution schemes, staff enrolments/pay profiles, pay-item library and assignments, loans, payslip line snapshots, salary history, and version/snapshot fields on payroll records.
   - Extend existing School, staff/person, payroll record and payslip relations without duplicating existing concepts.
   - Add additive migration(s), indexes, safe backfills, and tenant-safe foreign keys/uniques where supported. Seed only legacy-equivalent settings marked needsVerification = true; do not represent them as verified legal advice.
   - Add a parity test proving existing payroll runs and backfilled payslip lines preserve their original values.

3. **Decimal statutory calculator**
   - Implement pure finance/payroll/payroll-calculator.ts using Prisma.Decimal (or a compatible decimal abstraction already used by the repository), with explicit rounding at documented boundaries.
   - Calculate earnings, pensionable base, employee/employer contributions, optional Tier 2/Tier 3, taxable income, PAYE bands, other deductions and net pay in the specified order.
   - Add golden, band-boundary, contiguous-band, and accounting identity/property tests. No JavaScript floating-point arithmetic for money, rates applied to money, or rounding.

4. **Settings workflow and authorization**
   - Add settings service/controller and shared Zod schemas/types.
   - Enforce draft → pending approval → active-on-effective-date; only actual school membership roles owner and headteacher may approve; proposer cannot approve; admin cannot approve. Do not rely on the role guard's headteacher/admin alias.
   - Require the repository's supported 2FA/step-up mechanism for approval; if no suitable mechanism exists, stop and report the gap rather than introducing a bypass.
   - Validate contiguous bands, first band at 0%, open-ended final band, rates in range, non-overlapping effective dates, school scoping, and before/after audit records in the same transaction. Add impact-preview endpoint.

5. **Payroll integration and pay profiles**
   - Remove the hard-coded PAYE bands, SSNIT percentages/limits, and 2026-only year guard. Resolve approved effective settings for the payroll month and clearly block generation when no settings exist.
   - Pin schedule/scheme/settings versions on each run; persist payslip line snapshots and split employee/employer contribution totals.
   - Add separate statutory payable accounting for PAYE, SSNIT, Tier 2 trustees, Tier 3 and other deductions while preserving the existing reconciliation and separation-of-duties checks.
   - Add pay-profile/enrolment endpoints, encrypted-at-rest bank details using an established repository encryption pattern, masked display, audited reveal, and salary history with mandatory reason.

6. **Employee self-service and UI**
   - Add GET /me/payslips and GET /me/payslips/:id, scoped to the authenticated person and only APPROVED/PAID runs; expose Tier 2/Tier 3 lines only when enrolled.
   - Add school/my-payslips-workspace.tsx, navigation/routing, portal/payroll-settings-workspace.tsx, approval inbox, impact preview, and updated payroll columns. Follow the existing theme tokens and shared UI conventions.
   - Provide server-generated payslip PDF with the required header, itemization, totals, YTD fields, memo lines, confidentiality notice and QR code after confirming the PDF/QR approach.

7. **Verification and phase gate**
   - Add role tests, cross-tenant tests for each new endpoint, proposer/self-approval/admin rejection tests, staff IDOR tests, effective-date tests, parity tests, and end-to-end propose/approve/generate/approve/pay flow tests.
   - Run pnpm typecheck, pnpm --filter @schoolhub/api lint, pnpm --filter @schoolhub/api test, relevant migration checks, and web build/typecheck.
   - Review the complete diff and report files, migrations, test results, assumptions, and unresolved items. Do not merge or start Phase 4 without approval.

## Migration and seed policy

- Legacy-equivalent PAYE seed bands: monthly widths 588 / 80 / 100 / 2,900 / 16,000 / 30,332 / open-ended at 0 / 5 / 10 / 17.5 / 25 / 30 / 35 percent; SSNIT 5.5% employee, 13% employer, insurable range 587.80–69,000. All seed rows are needsVerification = true.
- The prompt notes the GRA Act 1178 notice effective 1 September 2026 prints the last band as 30,334 while existing code uses 30,332. The active seeded value must not be silently changed; see blocking decisions below.
- Do not seed earlier-period schedules without an official, verifiable GRA source. Payroll for a month without an approved effective schedule must fail clearly.
- Migration/backfill must not change historical run totals; historical snapshots remain historical.

## PDF / QR decision to confirm

The API already depends on jspdf and jspdf-autotable, so reusing them for server-side payslips may minimize dependency growth. Confirm whether this is acceptable and whether QR should encode only a signed, rate-limited verification token or whether public verification is out of scope. No public endpoint will be added without explicit approval.

## Blocking decisions — do not implement calculation policy until confirmed

1. **Employer SSNIT rounding:** exact arithmetic gives GHS 629.88 at 13% on GHS 4,845.25; the reference slip shows GHS 629.89. Choose the rounding rule and where rounding occurs.
2. **Tax treatment / Tier 3 relief:** confirm the tax treatment and relief cap for Tier 3 and whether an employer-borne employee share is a taxable benefit. The employee-level employerShareTaxable switch defaults off per the approved product decision, but the tax engine's legally correct treatment/cap still requires confirmation.
3. **Final PAYE band:** current code's last finite monthly band is GHS 30,332; the cited notice prints GHS 30,334. Confirm which should be seeded pending formal verification. Until resolved, the schedule remains explicitly unverified and must not be represented as legally approved.
4. **PDF / QR:** approve reuse of jsPDF + jsPDF-AutoTable and clarify whether public QR verification is wanted. If verification is approved, expose only minimal data and rate-limit it.

## Initial repository observations

- finance.service.ts currently contains PAYE_MONTHLY_BANDS_2026 and a number-based roundMoney / calculateResidentPaye2026 implementation; this is a known floating-point path to replace.
- finance.controller.ts currently validates payroll year with z.literal(2026).
- finance.permissions.ts centralizes finance roles; the new statutory-settings approver policy must be separate and based on the actual membership role.
- apps/api/package.json already includes jspdf and jspdf-autotable.
- The current finance model is in apps/api/prisma/schema/finance.prisma; related identity and staff relations must be inspected before defining new foreign keys.


## Confirmed user decisions (2026-10-25)

- Employer SSNIT uses standard decimal half-up rounding; the supplied example rounds to GHS 629.88.
- Tier 3 relief and employer-borne share tax treatment remain unverified. A schedule containing unresolved statutory settings must not be approved or activated.
- Seed the legacy GHS 30,332 PAYE band, with `needsVerification = true`.
- Reuse jsPDF + jsPDF-AutoTable. No public QR verification endpoint; QR, if generated, contains only a private opaque token.

These decisions do not certify the seeded statutory values as current legal advice. The implementation must preserve the unverified marker and block approval until all required statutory fields have been verified by an authorized reviewer.

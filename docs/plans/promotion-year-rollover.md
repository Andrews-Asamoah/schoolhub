# Promotion and academic-year rollover

Target: dev. This is a reviewed student-progression workflow, not an automatic grade classifier.

## Workflow

1. Create the next academic year, its first term and destination classes using existing setup screens. Keep the source year current. Year-specific destination classes must belong to the target year; shared classes are allowed.
2. Open Enrolments → Promotion and year rollover. The final source term and first target term are used. Every active student with an active or completed final-term placement receives one explicit PROMOTED, REPEATED, GRADUATED or SKIPPED decision and a meaningful reason.
3. Record the school policy name/version and evidence basis. Published final-term reports are required by default; a school may explicitly declare a manually reviewed alternative. No pass mark or progression rule is guessed from class names. Graduates must come from a graduating class; repetitions preserve academic level; configured class order constrains promotion/skipping.
4. Preview validates school ownership, complete cohort coverage, current placements, target dates/classes, prior target placements, published reports and destination capacities. It performs no student writes.
5. Submit the immutable decisions and evidence fingerprint. A different owner/headteacher must review them. Changes to placements, reports, capacities or academic context invalidate approval. Unapplied stale batches can be cancelled and replaced.
6. Apply only after the source year has ended and the first target term has begun. One transaction completes source-year active placements, creates target placements for continuing students, records promotions/graduations, updates current class/department and activates the new academic year/first term. Repeated application is idempotent.
7. An independent rollback decision may restore the previous placements and context only before target attendance, assessments, bills, reports or submissions exist and while student/context state remains unchanged. Prior promotion records are retained with reversal metadata. Otherwise use a reviewed corrective placement process; never erase lived academic history.

## Preserved data and setup

Financial balances and historic bills, receipts, reports, attendance, memberships, houses and accounts are not reset. Graduation retains outstanding debt. Class/teacher/subject allocations, timetables and fee structures are not blindly copied; prepare the target configuration before rollover. Later term placement continues through the existing enrolment workflow.

The legacy global year/context controls reject year switching when a current year already has enrolments; historical viewing remains available. Data writes for student placement and downstream academic activity serialize against rollover/rollback.

Current batch safety limit: 2,000 active final-term students; cohort review is paged in the UI. Larger schools require a separately tested expansion. Individual school promotion policy and a real-school rollover rehearsal are operator acceptance steps.

Migration: 20261031140000_promotion_rollover. No live student progression is performed by deploying the code.

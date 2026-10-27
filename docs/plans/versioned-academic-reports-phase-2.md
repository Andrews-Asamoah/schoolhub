# Versioned academic report approvals — Phase 2 first production slice

**Source and merge target:** `dev`. Builds on the existing school-scoped report-card generation and access guards.

## What this adds

- New immutable, versioned **report source** row per report set and pupil; includes frozen marks, remarks, class,
  school name, report template layout and student identity captured at generation.
- Each version has a reproducible source SHA-256 seal, distinct class-teacher recommendation and
  headteacher recommendation, actor names/ids and timestamps.
- Teacher review is restricted to the actual assigned class teacher. Only the `headteacher`
  role can perform headteacher approval; the same user may not sign both stages.
- Batch review and publication now require that **every published pupil** has two complete,
  independently approved versions, with matching stored source hashes.
- Regeneration creates **version N+1**, retaining old versions marked `SUPERSEDED`.
  Published sets may not be regenerated.
- Downloadable school-issued PDFs are generated server-side from frozen source plus approval
  evidence, scoped to the authenticated student or a guardian whose link permits reports.
  Private PDFs are never placed in publicly accessible object storage.
- SQL trigger rejects changes to academic snapshots and past approvals and rejects
  rewriting a published version.
- Existing previously published legacy reports remain visible, but no unsupported approval
  history is fabricated for them. Their historical print view is retained until a validated
  migration/reissue process exists.

## Caveats and further hardening

- These are attributable **electronic workflow approval records**, not certificate-based PAdES
  signatures or copies of uploaded handwritten signatures. The PDF clearly says so.
- This first slice does not provide evidence files, historical approval migration, independent
  class ranking correction fan-out, template-signature-image rendering, offline PDF storage,
  archival legal holds or a multi-party amendment/reissue feature.
- A future approval revision workflow must supersede old published reports through a controlled
  release (never mutate `PUBLISHED` rows). A set deletion currently cascades versions: add an
  explicit retention/archival policy before granting anyone batch deletion capabilities.
- For existing published reports, no new PDF is offered until an authorised historical
  reissue is signed off.
- BECE results and PDFs remain **staff-only** and are NOT processed by this internal term-report
  publication workflow.

## Backout and migration

The new table is additive. Roll back the web and API release independently; preserve
`report_card_versions` rows, audit events and older `report_cards` during a reversible
deploy. Do not retroactively replace signed-off data or drop the table on a live rollback.
Check row counts and hashes when migrating to another report-rendering version.

## Validation

Prisma schema generation, Nest build, web typecheck/build, academic PDF unit tests, SQL
constraint checks, PostgreSQL integration for different-person sign-offs, tenant isolation
and student/guardian download denial must pass in CI before merge into `dev`.

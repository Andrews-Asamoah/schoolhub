# Mobile Phase 7: Teacher

Branch: `feat/mobile-phase-7-teacher`, from `dev` at
`8de4eb45d4226ea70aeb256bf0ec8ab45e29132e` (Student Phase 6).
The attached Mobile Re-audit and Implementation Plan v3 supersedes the older
mobile plan. This phase changes only `apps/mobile` and documentation.
Teacher, student and guardian remain the only mobile roles. External exams
and BECE remain blocked by endpoint definitions and permissions.

## Built

- Teacher tabs: Home, Classes, Assess, Assignments and More. More carries the
  shared unread notification badge; shared messages, notices, profile, security
  and academic context remain available.
- Home uses the teacher's actual assignments, today's lessons and class-teacher
  register gaps. Classes provide roster search, a minimized student profile,
  subjects, attendance summary and current assessment results. Weekly timetable
  is available from Home and More.
- Register uses FlashList, immediate in-memory status/count previews, haptic
  controls, present/absent/late plus excused/sick/permission, mark-all-present,
  date selection, recent recorded dates and gaps. Only class teachers may edit.
  Calendar overrides, weekends, future dates and term bounds disable marking.
  Saving sends only explicitly changed roster members, preserves existing
  remarks, and requires server confirmation. Failed batches remain visibly
  unsaved; date changes require explicit discard. Changing class resets the
  editor. Offline writes are neither queued nor automatically retried.
- Score entry uses the same GET/PUT `/assessments/entry` contract as the web
  workspace, rather than the older per-score POST. It supports server-provided
  templates/components/repeated slots, per-component maxima, nullable clears,
  explicit zeroes, read-only/locked states and server-calculated results.
- Internal mocks include paper marks, explicit absence, version-aware saves,
  confirmation before finalization, correction requests/history and report
  recommendations. Pending edits retain the originally displayed version even
  when a background refresh arrives. Headteacher approvals, exam administration,
  report generation/publication and external examinations have no mobile action.
- Academic report review shows the teacher queue and recommendations. Assignment
  management includes publishing to an assigned class/subject, optional UTC due
  date, submission review, bounded grading and feedback. Forms use TanStack Form
  and Zod; API writes validate request payloads before transport.
- Clubs support membership lists, adding pupils from taught class rosters and
  confirmed removal. The inventory's exact DELETE route includes `:studentId`.
- Added 33 teacher-only endpoint declarations (85 total). Response schemas strip
  unnecessary identity, health, family-contact and financial fields. Queries
  are scoped by school/teacher and explicitly opt out of persistence. Existing
  session-generation guards and scoped online mutations remain authoritative
  client protections; the server owns resource authorization.
- Removed the matching teacher roster, register and assessment dev previews and
  their launcher entries. Other development galleries remain release-excluded.

## Verification

Two task gates each ran all 12 commands in section 10 of v3. Full, real command
output is committed in:

- [Contract task](../validation/mobile-phase-7/task-1-contracts.txt)
- [Screens and final runtime gate](../validation/mobile-phase-7/task-2-teacher-screens.txt)

| Check | Final result |
| --- | --- |
| Frozen install; shared build | Pass; no dependency or lockfile changes |
| Mobile typecheck, strict lint, formatting | Pass; no lint warnings |
| Jest | 27 suites, 226 tests passed |
| Contrast | 1,624 pairs passed |
| Endpoint inventory verifier | 85 declarations passed |
| Release/auth/route regression scripts | 41 passed |
| Expo Doctor with network | 20/20 passed |
| Android export and release-source verification | Pass; 6,769,544-byte Hermes bundle |
| iOS export and release-source verification | Pass; 6,776,532-byte Hermes bundle |
| Release app sources | 64; no dev/mock, unsupported-role or external-exam routes |
| API/web/shared source and route inventory | Unchanged |

Tests cover role denial before transport, URL encoding, minimized profiles,
private teacher query scopes, calendar eligibility, changed-only register batches,
loading/error/retry/empty/data screens, immediate register editing, class-teacher
restrictions, rejected saves, score limits, recommendation validation, mock
version capture across refreshes, explicit absence and duplicate-candidate denial.
Jest emits its existing one-second asynchronous-handle advisory and exits normally;
no forced exit or warning suppression is added.

## Existing repository CI blocker

A separate read-only check fails on the starting `dev` tree:

```text
$ node apps/api/scripts/route-inventory.mjs --check
Route inventory is stale: run node apps/api/scripts/route-inventory.mjs
```

Regeneration was compared and then restored byte-for-byte. Existing controller
changes absent from the inventory are GET/POST `/api/inventory/categories`, POST
`/api/schools/current/photos/students/bulk`, and explicit role metadata on PUT and
DELETE `/api/schools/current/me/avatar`. No new teacher endpoint is missing or
uses these operations. Per ground rules 8–9, this phase does not amend those
contracts or the backend. Full repository CI cannot be claimed green until the
owner resolves that discrepancy.

## Not completed and decisions

No Android device, emulator, Xcode/iPhone, seeded account or running school API
was available. Actual teacher sign-in, real roster/register/mark writes, native
haptics/keyboard behavior, low-end 500-row scrolling, TalkBack/VoiceOver, 200%
font scaling, light/dark screenshots and native builds remain manual acceptance
gates. Automated schema/component tests and Metro exports do not replace them.
Keep the PR draft until that evidence and CI are reviewed.

N3 is still open in v3: teacher announcement creation and document access are
therefore deferred. Teachers can read shared announcements. N2/N5 (push/offline)
remain Phase 8 work and require owner approval before any backend change.
Native MFA remains deferred under Phase 4A; this phase does not change auth or
claim enrolled accounts work on hardware. Existing password-recovery email
links continue to use the web portal. No API/database change is proposed.

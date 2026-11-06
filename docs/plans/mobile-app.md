1. Goal

Build the SchoolHub mobile app (apps/mobile) for the existing SchoolHub platform, on the dev branch of Andrews-Asamoah/schoolhub. It must feel classy, elegant, and modern, with a refined glassmorphism look, and meet current best-practice standards for mobile UX, accessibility, security and performance.

The mobile app is a new client of the existing NestJS API. Do not redesign the backend. Make only the API changes listed in Part A section 9.

2. Repo facts (verify, do not assume)
Monorepo: pnpm + Turborepo. pnpm-workspace.yaml already includes apps/* and packages/*. Node >= 22.
apps/api: NestJS + Prisma + PostgreSQL. Auth is Better Auth with organization (school = tenant), bearer() (token auth intended for native clients), and two-factor (TOTP) plugins.
apps/web: React 19, Vite, TanStack Router/Query/Form/Table, Tailwind v4, shadcn-style UI. Font: Inter.
packages/shared: Zod schemas and TS types (roles, request payloads). Builds ESM and CJS to dist/.
apps/mobile does not exist yet. apps/desktop is out of scope.
Read these first, before writing code: ARCHITECTURE.md, AGENTS.md, docs/architecture/academic-platform-invariants.md (contains the BECE staff-only rule), docs/architecture/route-inventory.json (which roles may call which endpoint), apps/web/THEMING.md, apps/web/src/index.css (design tokens), apps/web/src/lib/school-navigation.ts (role-to-page matrix), apps/web/src/lib/api.ts (headers and error handling), apps/api/src/common/guards/school-tenant.guard.ts, apps/api/src/common/origin-policy.ts, apps/api/src/auth/auth.factory.ts.
3. Stack (use this unless a verification step proves it unworkable; then stop and report)
Expo (React Native, TypeScript) with development builds and EAS. Use the latest stable Expo SDK at project start.
Expo Router (file-based routing).
TanStack Query with a persisted cache (MMKV or AsyncStorage persister), TanStack Form + Zod using schemas from @schoolhub/shared.
Better Auth client for Expo/React Native, with tokens in expo-secure-store.
Styling: NativeWind (Tailwind classes) or an equivalent that works with the design tokens. Verify compatibility with the Tailwind v4 token approach before committing; if it doesn't work, use a typed theme object instead.
Motion and gestures: react-native-reanimated, react-native-gesture-handler, expo-haptics.
Glass: expo-blur, expo-linear-gradient.
Lists: @shopify/flash-list. Sheets: @gorhom/bottom-sheet.
Files: expo-file-system, expo-sharing, expo-document-picker, expo-image-picker, expo-image.
Push (Phase 5): expo-notifications.
Icons: lucide-react-native (matches the web's lucide icons).
4. Hard rules (never break these)
Do not invent endpoints. Use only endpoints that exist. docs/architecture/route-inventory.json is the source of truth for paths and allowed roles. If a needed endpoint is missing, stop and list what is missing instead of guessing.
BECE / external examinations are staff-only. Students and guardians must have no BECE route, screen, notification, PDF, or embed. Enforce this in code paths, not only by hiding navigation.
Every authenticated request must send the bearer token plus x-school-subdomain (the school code the user entered) and x-school-role (the active role), except GET /schools/roles, which must not send the role header (same as apps/web/src/lib/api.ts).
Never store tokens in plain storage. Use expo-secure-store. Never log tokens, passwords, or personal data (students are minors).
Authorization is the server's job. The client hides what a role cannot use, but never relies on that for security.
Downloaded PDFs and files come from authenticated API endpoints (the API streams private files; there are no public URLs). Save them to the cache directory, share them, and delete them afterwards. Do not persist sensitive documents unencrypted.
Do not change apps/web except for moving shared code into packages/shared (Phase 0 tasks). Do not change apps/api except for the items in section 9.
One account belongs to one school (non-super-admin). Super admin is web-only; do not build it on mobile.
After every task: run pnpm typecheck (and the mobile app's lint and tests once they exist). Do not report work as done without showing the command output.
If anything in this brief conflicts with the actual repo, trust the repo, tell me exactly what differs, and wait for my decision.
5. Decisions (edit these if you disagree)
Guardian fees are view-only in v1. No in-app payment.
Teacher BECE/external-exam entry is deferred (not in v1). Internal mock exams are in scope.
Glass with a fallback: frosted glass on capable devices; on low-end Android, GlassSurface falls back to a translucent solid colour (no blur).
Offline: only the teacher attendance register queues offline in v1. Everything else is online with cached reads.
Platforms: Android first (Play Store), then iOS.
6. Authentication flow (verify each step against the API)
/school: user enters the school code. Call GET /schools/public/:subdomain (anonymous). Store the subdomain. Use the returned name, logo, primaryColor, secondaryColor for branding.
/login: user enters username or email. Call POST /schools/public/:subdomain/resolve-login to get the login email, then sign in with Better Auth. Sign-in is rate-limited (about 5 per minute); show a friendly message on 429.
If sign-in returns twoFactorRedirect, go to /two-factor (TOTP or backup code). School-admin roles require two-factor to be set up; route them to /two-factor-setup if the API says so.
If the user has mustChangePassword, or any API call returns 403 with error: "PASSWORD_CHANGE_REQUIRED", go to /change-password. Temporary passwords can expire; show a clear message and the way to ask the school for a new one.
If any API call returns 403 with error: "SUBSCRIPTION_INACTIVE", go to /subscription-inactive.
After sign-in, call GET /schools/roles. If the user has several roles, let them choose and offer a role switcher in the app. Persist the active role and send it as x-school-role.
Sessions last about 7 days. Handle 401 by clearing the secure store and the query cache, then returning to /login.

Verify first: how the Better Auth bearer plugin returns the token (response header or body) and how the Expo client stores and sends it. Check the current Better Auth docs. Check whether apps/api/src/common/origin-policy.ts and auth.factory.ts need an app-scheme entry in trusted origins for native requests, and report before changing anything.

7. Design system: elegant glassmorphism

Principles

Glass for chrome, solid for data. Use frosted glass for the floating tab bar, headers, hero cards and bottom sheets. Dense screens (attendance register, score entry, finance lists) use calm, near-opaque surfaces for legibility.
Never stack more than two glass layers.
Tenant-aware theme: tint the background gradient and accents with the school's primaryColor / secondaryColor. Show the school logo and name on login and home.
Light and dark parity from day one; follow the system setting with a manual override.

Tokens

Source of truth: :root and .dark in apps/web/src/index.css (colours are OKLCH; the primary hue is about 276). React Native cannot use oklch(), so write a small script that converts the web tokens to sRGB and generates the mobile theme file. Keep the semantic names (background, foreground, card, primary, secondary, accent, muted, border, destructive, success, warning, info, chart-1..5).
Add glass tokens: glassSurface (alpha), glassBorder (1px hairline, about 12–20% white), glassHighlight (inner top edge), blurIntensity, shadowSoft.
Typography: Inter via expo-font. A clear scale (large title, title, headline, body, caption). Support Dynamic Type.
Spacing on a 4pt grid. Radius scale generous (cards about 20–24, sheets about 28).

Signature components (build once, reuse everywhere) GlassSurface (with fallback), GlassCard, GlassTabBar (floating, rounded, animated active pill), GlassHeader (large title that collapses on scroll), StatTile, Sheet, SegmentedControl, Avatar, TimelineList, ListRow, Skeleton (shimmer), Toast, EmptyState, ErrorState, PrimaryButton / SecondaryButton / GhostButton, TextField, SelectField.

UX standards

44pt minimum touch targets; primary actions anchored at the bottom within thumb reach; safe areas respected.
Large titles, pull-to-refresh, skeleton loading instead of spinners, clear empty and error states with a retry.
Optimistic updates with haptic feedback when marking attendance.
Spring motion about 150–250 ms; shared-element transitions list-to-detail where practical. Respect Reduce Motion and (iOS) Reduce Transparency.
Accessibility: screen-reader labels, sufficient contrast (audit glass over the gradient, as the web does with audit:theme), dynamic type, focus order.
Currency uses the school's currency setting.

Performance guardrail: blur is expensive on low-end Android. Test on a low-end Android device early. Provide a device-tier check and a setting that turns blur off. Memoize list rows, use FlashList, and keep animations on the UI thread.

8. Route map and screens

Files live under apps/mobile/app/. Role access comes from route-inventory.json.

(auth): school, login, two-factor, change-password, two-factor-setup, subscription-inactive.

Guardian (tabs: Home, Children, Fees, Notices, More)

Route	Screen	Endpoints
(guardian)/index	Ward switcher, today's timetable, attendance snapshot, fee balance, latest notice	/students/my-wards, /announcements
children/[wardId]/index	Ward hub	/students/my-wards/:id
children/[wardId]/attendance	Attendance history	/attendance/guardian/:studentId
children/[wardId]/timetable	Weekly timetable	/timetable/guardian/:studentId
children/[wardId]/reports	Published reports and mock results with PDF	/assessments/report-cards/guardian, .../guardian/:reportId/pdf, /internal-exams/published/guardian, .../guardian/:id/pdf
fees/[wardId]	Balance and history (view-only)	/students/my-wards/:id/fees
notices/[id]	Announcement	/announcements

Student (tabs: Home, Timetable, Learning, Attendance, More)

Route	Screen	Endpoints
(student)/index	Today, due assignments, fee badge	/students/me, /students/me/fee-status
timetable	Weekly timetable	/timetable/me
learning/subjects	Subjects	/students/me/subjects
learning/assignments/[id]	List, detail, submit	/assignments, /assignments/:id/submission
learning/reports	Report, published reports, mock results with PDF	/assessments/me/report, /assessments/report-cards/me, .../me/:reportId/pdf, /internal-exams/published/me, .../me/:id/pdf
attendance	Attendance	/attendance/me
more/classmates, more/house-clubs, more/announcements	Classmates, house and clubs, notices	/students/me/classmates, /students/me/clubs, /academics/houses, /announcements

Teacher (tabs: Home, Classes, Assess, Assignments, More)

Route	Screen	Endpoints
(teacher)/index	Today's lessons, register gaps	/teaching/me, /timetable/mine
classes/[classId]/roster	Roster	/academics/classes/:id/students
classes/[classId]/register	Mark attendance (offline-tolerant)	/attendance/class/:id, .../dates, .../gaps, POST /attendance/batch
classes/[classId]/students/[studentId]	Student profile	/students/:id/profile
assess/index	Score entry	GET/PUT /assessments/entry
assess/mocks/[paperId]	Mock marks, finalize	/internal-exams/papers/:id, PUT /internal-exams/marks, PATCH /internal-exams/papers/:id/finalize
assess/reports	Report review and recommend	/assessments/report-cards/teacher-queue, POST .../versions/:id/recommend, POST /internal-exams/reports/:id/recommend
assignments/index, new, [id]	Create, view submissions, grade	/assignments/manage, POST /assignments, PATCH .../grade

Accountant, light (tabs: Home, Payments, Outstanding, Statements, More) Home uses /finance/summary. Payments lists and records via POST /finance/payments with .../receipt.pdf. Outstanding uses /finance/students/outstanding. Statements use /finance/students/:id/statement and .pdf. More has fee reminders and admission fee receipt. Payroll, journals, periods and audit are web-only.

Management: owner, admin, headteacher, staff (tabs: Dashboard, People, Attendance, Approvals, More) Dashboard uses /dashboard/analytics. People are lookups for students, teachers and guardians. Attendance shows class overview and gaps. Approvals (headteacher only): report head-approve, internal exam correction approve/reject, exam open/lock, attendance exclusions. Announcements: create, pin, status. Support tickets for owner and admin only. Show only what each role is allowed to call.

Shared (shared) for all roles: messages (inbox, sent, compose, recipients), notifications, profile (basic details, photo upload to PUT /schools/current/me/avatar; JPEG, PNG or WebP, max 2 MB), security settings (change password), role switcher, sign out.

9. Allowed API changes (nothing else)
If verification proves it necessary: add the app scheme to trusted origins in origin-policy.ts and update its spec.
Phase 5: a DeviceToken model (Prisma migration) and POST/DELETE /notifications/devices; send push through the existing durable job service. Add tests.
Phase 3/5: if POST /attendance/batch is not safe to replay, add idempotency (a client mutation id or equivalent) with tests. The server must clearly reject closed days and policy violations.
Add e2e tests proving bearer auth works with x-school-subdomain and x-school-role.
10. Working agreement for the AI
Start each phase by listing what you will verify and what you will build.
Work in small commits on a feature branch off dev (for example feat/mobile-phase-N). Never push to main.
Show command output for typecheck, tests, and builds. Be explicit about anything you could not run (for example, no device or emulator available).
When something is ambiguous or the repo disagrees with this brief, stop and ask. Do not guess.
End each phase with: what was built, what was verified, what is not done, and any decisions needed from me.
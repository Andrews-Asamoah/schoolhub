# SchoolHub Architecture Guide

This document describes the repository as it exists today: a pnpm/Turborepo monorepo with a React web client, a NestJS API, shared validation contracts, and a PostgreSQL database managed through Prisma. It distinguishes working code from folders or schema areas that are present as groundwork but do not yet have a complete user-facing implementation.

## 1. System at a glance

```text
Browser
  └─ apps/web (React, Vite, TanStack Router, TanStack Query)
       ├─ /api/* proxy in development ───────────┐
       └─ Better Auth client, cookie session ────┤
                                                 v
                                      apps/api (NestJS)
                                       ├─ Better Auth
                                       ├─ tenant and role guards
                                       ├─ domain controllers/services
                                       └─ Prisma client
                                                 |
                                                 v
                                        PostgreSQL (17)

apps/web and apps/api ── @schoolhub/shared (Zod schemas and TS types)
apps/web ────────────── @schoolhub/config (shared TypeScript config)
```

The API is intended to be the common backend for web, mobile, and desktop clients. The web client is the only client with checked-in application source at present. The `apps/desktop` and `apps/mobile` directories do not currently contain implementation files.

## 2. Repository and package map

### Repository root

- `apps/` — user-facing applications and backend services.
- `packages/` — workspace packages shared by applications.
- `package.json` — workspace-level scripts, Node.js engine requirement, and tooling. The project requires Node.js 22 or newer and uses pnpm.
- `pnpm-workspace.yaml` — includes every direct child of `apps/` and `packages/` in the pnpm workspace.
- `pnpm-lock.yaml` — lockfile for the workspace dependency graph.
- `turbo.json` — task graph and caching behavior. Builds and typechecks depend on upstream workspace builds; development tasks are persistent and uncached.
- `docker-compose.yml` — local PostgreSQL 17 service, exposed on host port 5433 (container port 5432), with a persistent named volume.
- `.gitignore` — excludes dependency/build outputs and the root `.env`; configuration secrets should remain in environment variables, not source control.

### `apps/api/` — backend API

NestJS application exposing authentication, health checks, and school-management endpoints. Its source is organized as follows:

- `src/main.ts` — loads environment configuration first, bootstraps Nest, configures OpenAPI and CORS, and listens on the configured port.
- `src/app.module.ts` — root composition point. Imports Prisma, Better Auth, and the school, student, academics, attendance, assessments, finance, super-admin, and support modules; installs the global exception filter.
- `src/auth/` — Better Auth configuration and a Prisma adapter. The auth plugins include organizations (used as school tenants) and bearer tokens (intended for native clients).
- `src/common/` — cross-cutting HTTP support:
  - `decorators/` extracts the authenticated user and resolved school from a request, and declares allowed roles.
  - `guards/` enforce school membership/tenant selection and endpoint role requirements.
  - `pipes/` validate request bodies against shared Zod schemas.
  - `filters/` normalizes HTTP and Prisma errors into JSON responses.
- `src/prisma/` — shared Prisma service/client lifecycle and Nest module.
- `src/modules/` — feature modules, each following a controller/service/module layout:
  - `schools/` — current school profile and academic years.
  - `students/` — student listing, details, creation, updates, and soft deletion.
  - `academics/` — classes, class rosters, and subjects.
  - `attendance/` — batch attendance recording and class/student attendance queries.
  - `assessments/` — assessment templates, component score recording, and student reports.
  - `finance/` — fee structures, bill generation, payments, and student ledgers.
  - `support/` — school-scoped support tickets, platform-wide super-admin inbox, replies, status/priority management, and activity history.
- `src/env.ts` — validates required environment variables and the optional API port with Zod.
- `src/load-env.ts` — loads the repository-root `.env` for local development; deployment environments can supply variables directly.
- `prisma/schema/` — modular Prisma schema files described in [Data model and persistence](#5-data-model-and-persistence).
- `prisma.config.ts` — points Prisma to the schema directory and the migrations directory.
- `test/` — API end-to-end test configuration and test files.

### `apps/web/` — browser application

React 19 single-page application built with Vite:

- `src/main.tsx` — creates the TanStack Router and React Query providers.
- `src/routes/` — file-based routes: root layout, `/`, `/login`, `/dashboard`, and `/$page` for school workspaces. The super-admin console lives under `/admin` and includes the platform dashboard, school directory/enrollment/details, subscriptions, tenant users, support desk, and the current administrator profile. The router plugin generates `src/routeTree.gen.ts`; that generated file should not be edited manually.
- `src/lib/school-navigation.ts` — grouped school-admin navigation catalogue and the status of each feature's API support.
- `src/components/school/` — reusable school sidebar/workspace shell and page UI (headings, data tables, empty/loading/error states, and stat cards). Workspaces with API support load real tenant data; unfinished areas are explicitly marked planned.
- `src/components/support/` — shared ticket inbox and conversation UI used by school administrators and platform super administrators. It polls the relevant ticket queue and open conversation every three seconds; ticket replies and status/priority changes are stored in the conversation timeline.
- `src/components/forms/` — shared form controls for labels, inputs, selects, textareas, validation messages, and submit/cancel actions. Feature forms use `@tanstack/react-form` with shared Zod contracts from `@schoolhub/shared`, keeping field styling and validation behavior consistent.
- `src/components/school/dashboard/` — dashboard header, overview composition, metric/attendance cards, activity/schedule cards, and the sample dashboard data; the `/dashboard` route coordinates session, school, and search state.
- `src/lib/auth-client.ts` — Better Auth browser client using the `/api/auth` path and organization client plugin.
- `src/lib/api.ts` — typed `fetch` wrapper for JSON API calls. It includes browser credentials for cookie-based sessions and throws `ApiError` for non-success responses.
- `src/lib/query-client.ts` — shared React Query cache configuration.
- `src/components/ui/` — reusable shadcn-style UI primitives, including button, card, and the collapsible responsive sidebar.
- `src/index.css` — Tailwind CSS v4 import and global styles.
- `vite.config.ts` — configures the router generator, React, Tailwind, TypeScript path aliases, and the development `/api` proxy to `localhost:3001`.
- `index.html` — browser document shell mounting the React application.

The current UI is an initial slice, not a complete feature interface: it has a sign-in page, a polished dashboard, and school-workspace pages for the current API-backed features. Students, classes, subjects, academic years, assessment templates, attendance, fee structures, payments, school settings, and support tickets are wired to available API operations. School support conversations are restricted to the active school and school owner/admin roles; the platform support desk is restricted to super admins. Ticket lists and conversations refresh every three seconds while open, and replies plus status/priority changes are kept in the timeline. Other sidebar destinations, including the teacher, student, and guardian portal areas, have explicit planned-feature pages rather than fabricated records. The dashboard reads the current school when a session exists, but its displayed summary metrics, schedule, and activity feed are explicitly marked as preview data. Sidebar visibility is not yet filtered by tenant role; backend authorization remains authoritative.

### `apps/desktop/` and `apps/mobile/`

These directories currently have no checked-in source files. The API authentication setup and CORS allow-list anticipate native clients, but this repository does not yet include desktop/mobile applications or their build pipelines.

### `packages/shared/` — shared contracts

`src/index.ts` exports Zod schemas and inferred TypeScript types for common request payloads and roles, including students, classes, subjects, academic years, attendance, assessment scores, bills, payments, and support tickets/replies. The API applies these schemas through its Zod validation pipe; the web package can import the same contracts to keep request shapes aligned. The package builds distributable ESM and CommonJS outputs into `dist/`.

### Support ticket API

The support feature uses the existing `SupportTicket` and `TicketReply` models in `apps/api/prisma/schema/operations.prisma`; no extra database tables or migration are needed.

- `GET /api/support/tickets` and `POST /api/support/tickets` — list/create requests for the active school. School owner/admin membership is required.
- `GET /api/support/tickets/:ticketId`, `POST /api/support/tickets/:ticketId/replies`, and `PATCH /api/support/tickets/:ticketId/status` — read and update a request within that active school. School users may confirm-close a ticket after support has marked it resolved; closed tickets cannot receive replies.
- `GET /api/support/platform/tickets`, `GET /api/support/platform/tickets/:ticketId`, `POST /api/support/platform/tickets/:ticketId/replies`, and `PATCH /api/support/platform/tickets/:ticketId/status` — platform-wide inbox and ticket handling for super admins.

School list/detail queries are scoped to the active school and exclude internal tickets. Status/priority changes add durable timeline replies so both sides can see what changed and who changed it. The web client polls for new ticket activity every three seconds rather than using a persistent socket connection.

### `packages/config/` — shared TypeScript configuration

Contains the common TypeScript compiler options in `tsconfig.base.json`. Individual apps may extend or specialize those settings. The package currently has no runtime code.

## 3. Runtime and request flow

### Startup

1. The root `pnpm dev` command runs each workspace package's `dev` task through Turborepo. The web Vite server uses port 5173; the API defaults to port 3001.
2. The API's `main.ts` imports `load-env` before the rest of its application configuration. `env.ts` validates `DATABASE_URL`, `BETTER_AUTH_SECRET` (at least 32 characters), `BETTER_AUTH_URL`, and `WEB_ORIGIN`; `PORT` is optional and defaults to 3001.
3. Nest composes the root module, connects Prisma to PostgreSQL via the `pg` driver and Prisma's PostgreSQL adapter, installs auth and domain modules, then starts listening.
4. The web app sends `/api/*` requests through Vite's proxy to the API in development. In production, the client defaults to the same `/api` path unless `VITE_API_URL` is configured.

### Authenticated, tenant-scoped API request

1. The web Better Auth client makes session-aware requests. `apiFetch` includes cookies; the auth configuration also enables bearer authentication for the planned native clients.
2. The Better Auth Nest integration authenticates requests and provides session/user context. The health endpoint is public; `/me` is protected.
3. Feature controllers run the school tenant guard. It requires an authenticated user, resolves the active organization from the session (or the `x-organization-id` header), verifies organization membership unless the user is a platform `superAdmin`, and resolves the matching school.
4. `CurrentSchool` and `CurrentUser` decorators pass the resolved request context into controller methods. The role guard checks the organization membership role against any roles declared on the route; platform `superAdmin` bypasses those tenant role restrictions.
5. For endpoints with body schemas, the Zod pipe validates and parses input using contracts exported by `@schoolhub/shared`.
6. Controllers delegate to services. Services perform Prisma queries, generally scoping data using the resolved school ID. The global exception filter converts known HTTP and common Prisma errors into structured JSON responses.

The API enables credentialed CORS for the configured web origin plus local web and Tauri origins, and permits requests without an `Origin` header for native clients. New client origins must be deliberately added to the API's trusted-origin/CORS configuration.

## 4. Main API surface

All feature routes are tenant-guarded. Routes with write permissions also declare role requirements; request payloads with shared schemas are validated at the controller boundary.

| Area | Current endpoints |
| --- | --- |
| Health/session | `GET /health`, `GET /me` |
| Schools | `GET /schools/current`, `PATCH /schools/current`, `GET /schools/academic-years`, `POST /schools/academic-years` |
| Students | `GET /students`, `GET /students/:id`, `POST /students`, `PATCH /students/:id`, `DELETE /students/:id` |
| Academics | `GET /academics/classes`, `POST /academics/classes`, `GET /academics/classes/:id/students`, `GET /academics/subjects`, `POST /academics/subjects` |
| Attendance | `POST /attendance/batch`, `GET /attendance/class/:classId`, `GET /attendance/student/:studentId` |
| Assessments | `GET /assessments/templates`, `POST /assessments/scores`, `GET /assessments/student/:studentId/report` |
| Finance | `GET /finance/fee-structures`, `POST /finance/bills/generate`, `POST /finance/payments`, `GET /finance/students/:studentId/ledger` |
| Super-admin | `GET /super-admin/stats`, `GET /super-admin/schools`, `GET /super-admin/schools/:id`, `POST /super-admin/schools`, `PATCH /super-admin/schools/:id`, `POST /super-admin/schools/:id/admins`, `PATCH /super-admin/schools/:id/admins/:userId`, `DELETE /super-admin/schools/:id/admins/:userId`, `PATCH /super-admin/schools/:id/subscription`, `GET /super-admin/users` |

OpenAPI documentation is mounted at `/api/docs`.

School administrators created through the super-admin school-enrollment endpoint receive an initial password of `Admin@123`; the API hashes it before storing the credential. The enrollment form does not accept or transmit a password. Credential delivery is not automated yet, so the super admin must share the login details securely. This shared default is for the current enrollment flow only and should be replaced with unique, expiring setup credentials before production rollout.

Super admins can update a school's name, code, subdomain, contact email, phone, and address from its detail page. They can add an administrator either by granting an existing account membership or creating a new account with the same initial password described above. Ban and removal actions apply to the school membership only; removing a membership does not delete the user's platform account. The tenant guard rejects banned memberships, and the API prevents banning/removing a school’s last active administrator.

## 5. Data model and persistence

PostgreSQL is the system of record. Prisma provides generated model access; the API initializes a shared client through `PrismaService` and the `@prisma/adapter-pg` adapter. `docker-compose.yml` provides a local database, while `DATABASE_URL` selects the actual connection target.

The Prisma schema is split by concern so the data model can grow without one monolithic schema file:

- `base.prisma` — PostgreSQL datasource and Prisma Client generator.
- `enums.prisma` — shared domain enums for people, attendance, assessments, fees, payments, subscriptions, operations, and related workflows.
- `auth.prisma` — Better Auth users, accounts, sessions, verification records, organizations, membership roles, and invitations. An organization represents a school tenant.
- `school.prisma` — school profile and tenant-owned people: user profiles, students, teachers, staff, guardians, and guardian/student relationships.
- `academics.prisma` — academic years and terms, departments, classes, subjects, enrollments, assignments, houses, rooms, time slots, and timetables.
- `assessment.prisma` — attendance, grading systems/scales, templates/components/scores, remarks, report cards, behavioral notes, and transcript requests.
- `finance.prisma` — fee structures/items, bills, payments, ledger/accounting transactions, expenses, payroll, subscriptions/invoices, and fee reminders.
- `operations.prisma` — inventory, documents, audit records, support tickets, clubs, promotions, notifications, announcements, and message logs.

Tenant-owned business models generally carry a `schoolId` relation. Authentication identity and organization membership are distinct from school business records: the school is linked to its organization, and tenant guards resolve the school before domain services operate.

Prisma's config points at `apps/api/prisma/migrations` for migrations. The current tree contains the schema but no checked-in migration files, so schema migration history/setup should be confirmed when preparing a fresh or production database.

## 6. Cross-package contracts and responsibilities

- The API owns authentication enforcement, tenant resolution, authorization, validation enforcement, business operations, and database writes.
- The web app owns user interaction, browser routing, session-aware UI, and client-side cache/fetch behavior. It is not the source of truth for permissions.
- `@schoolhub/shared` is the reusable contract layer. It shares input schemas and role names but does not replace server-side validation.
- `@schoolhub/config` centralizes TypeScript compiler defaults, not application runtime configuration.
- PostgreSQL/Prisma own durable application state; React Query only caches server responses in the browser.

## 7. Local development

Prerequisites: Node.js 22+, pnpm 12.4.1, and Docker (for the included local database).

1. Install workspace dependencies with `pnpm install`.
2. Start PostgreSQL with `docker compose up -d db`.
3. Create a root `.env` containing the API variables listed above. For the included Compose database, use `postgresql://postgres:postgres@localhost:5433/schoolhub?schema=public` as `DATABASE_URL`. Do not commit this file.
4. Apply or develop database migrations with `pnpm db:migrate`.
5. Start the workspace with `pnpm dev`.
6. Open the Vite app at `http://localhost:5173`; API health is available at `http://localhost:3001/health`, and OpenAPI docs at `http://localhost:3001/api/docs`.

Useful root commands:

- `pnpm typecheck` — runs workspace typechecks through Turborepo.
- `pnpm db:migrate` — invokes Prisma migrate for the API package.
- `pnpm db:studio` — opens Prisma Studio for the configured database.

The API package also defines focused build, lint, unit-test, and end-to-end-test scripts; see `apps/api/package.json` for the exact commands.

## 8. Current boundaries and growth points

- There is no implemented desktop or mobile client yet; bearer auth and Tauri origins are enabling backend configuration, not proof of a shipped native app.
- The web route tree and dashboard are currently small scaffolding around sign-in and a current-school request. Complete domain workflows and populated dashboard metrics remain to be built.
- Several Prisma areas (for example inventory, payroll, support, notifications, and clubs) are represented in the data schema but do not have corresponding Nest feature modules in the current application composition.
- Keep new API features tenant-scoped: add a domain module, guard its routes, pass the resolved school/user from request context, validate inputs using shared schemas, and enforce role requirements for writes.
- When adding a new shared request shape, add it to `packages/shared` and consume it from both the API and client where appropriate, while always validating on the server.

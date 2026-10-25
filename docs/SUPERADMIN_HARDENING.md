# Super-admin hardening: what changed and how to deploy it

## Deploy checklist (do these in order)

1. **Rotate the old super-admin password.** The previous `prisma/seed.ts` contained a literal password in git history. Treat it as exposed: sign in and change it (or delete the user and re-seed).
2. **Set environment variables** (see `.env.example`): `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD` (seed only), `NODE_ENV=production`, `TRUST_PROXY=<number of proxies>`. Swagger (`/api/docs`) is now **off in production** unless `SWAGGER_ENABLED=true`.
3. **Check existing subscription values before deploying** (enforcement fails closed on unknown values):
   ```sql
   SELECT "subscriptionStatus", count(*) FROM organization GROUP BY 1;
   ```
   Anything other than `TRIALING, ACTIVE, PAST_DUE, CANCELLED, SUSPENDED` will lock that school out. Also review schools whose `expiresAt` is in the past: they enter a 7-day grace period, then lock.
4. **Run the migration:** `pnpm --filter @schoolhub/api migrate` (adds 3 audit actions + 2 indexes).
5. `pnpm install` (adds `helmet`, `@nestjs/throttler`), rebuild `packages/shared`, then the API and web.

## Behaviour changes

| Area | Before | Now |
| --- | --- | --- |
| Subscriptions | Stored but never enforced; two disconnected records | Enforced in `SchoolTenantGuard` (402-style 403 `SUBSCRIPTION_INACTIVE`); org + billing record updated in one transaction; policy in `evaluateSubscriptionAccess` (shared) |
| Trial | No end date | 30-day trial set at enrolment; 7-day grace after any expiry |
| Owner/admin passwords | Fixed, guessable role defaults | Random 16-char one-time password, forced change at first sign-in |
| Seed | Hard-coded credentials | Read from env, validated, forced change |
| Audit | Table existed, super-admin never wrote to it | Every super-admin mutation audited **inside the same transaction**; super-admin entering a school's data audited (once per 15 min per school) |
| Sessions | 7 days for everyone | Super-admin sessions capped at 8 h; banned accounts cannot create sessions; suspending/removing an admin revokes their sessions |
| HTTP | No security headers, public Swagger | `helmet`, trust-proxy, Swagger gated, super-admin routes rate-limited (writes: 30/min/client) |
| Validation | `parseInt` pagination (negative limit bug) | Zod-validated, bounded query schemas |
| Performance | `listSchools` loaded every student/teacher/member row | `_count` + select, server-side search/filter |
| Subdomain | Editable anytime (breaks student logins) | Blocked once students exist |
| Races | Check-then-insert, 500 on collision | Transactions + `P2002` mapped to 409 |

## Not done (needs your decision / infrastructure)

* **Two-factor authentication** for super-admins: needs Better Auth's `twoFactor` plugin, a schema migration, enrolment + sign-in UI and recovery codes. Highest-value next step.
* **Distributed rate limiting:** Better Auth's limiter and the throttler use in-memory storage. Use Redis when running more than one API instance.
* **Plan limits** (max students/teachers) are not enforced.
* Remaining raw-colour classes in other pages (`pnpm --filter @schoolhub/web lint:theme`); the files touched here are clean.

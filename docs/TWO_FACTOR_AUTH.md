# Two-factor authentication (2FA)

Authenticator-app (TOTP) codes plus single-use backup codes, built on Better Auth's `twoFactor` plugin.

## Who needs it

| Account | Policy |
| --- | --- |
| Platform super-admin | **Always required.** Every `/super-admin/*` route returns `403 TWO_FACTOR_REQUIRED` until enrolled; the web app sends them to `/two-factor-setup`. |
| School owner / admin | **Optional by default** (a reminder banner and a card on their Profile page). Set `REQUIRE_2FA_SCHOOL_ADMINS=true` to make it mandatory. The check looks at *every* role the account holds, so an admin cannot skip it by asking to act as a teacher. |
| Everyone else | Available on the Profile page for staff roles; not offered to students and guardians. |

## Deploy checklist

1. **Do NOT change `BETTER_AUTH_SECRET` after people enrol.** The authenticator secrets and backup codes are encrypted with it; a new secret makes them unreadable and locks everyone out of 2FA. If you intend to rotate it (you should, if it was ever shared), do it **before** the first enrolment, or use the emergency reset below for each account afterwards.
2. Apply the migration `20261025120000_two_factor_authentication` (adds `users.twoFactorEnabled` and the `two_factors` table).
3. `pnpm install` (adds the `qrcode` package to the web app), rebuild shared + api + web.
4. Sign in as super-admin: you'll be sent to set up 2FA first. **Save the backup codes** before confirming.
5. Optional: set `REQUIRE_2FA_SCHOOL_ADMINS=true` once your school admins have been told.

## Behaviour

* Sign-in is two steps. After the password, the server returns `twoFactorRedirect` and **no session** exists until a valid code arrives (5-minute window).
* 2FA only turns on after the user proves they can generate a code; abandoning setup leaves it off.
* Wrong codes: 5 attempts per minute per client, and **5 consecutive failures lock the account's second factor for 15 minutes** across all devices.
* "Trust this device" is refused server-side: administrator accounts are always asked for a code.
* The unused plugin endpoints `get-totp-uri`, `send-otp` and `verify-otp` are switched off.
* Enabling, disabling and regenerating backup codes are written to the audit log. Turning it off needs the password.

## Lost phone and backup codes

1. **School admin:** a platform super-admin opens *Schools → school → Administrators → Reset 2FA*. This removes the factor, signs the admin out everywhere and is audited. **Verify identity first** (e.g. phone call).
2. **Super-admin:** from a shell with database access:
   ```bash
   pnpm --filter @schoolhub/api reset-2fa admin@example.com
   ```
   They then sign in with their password and set it up again. Keep a second super-admin account so one person is never the only recovery path.

## Testing

```bash
# unit tests (no database)
pnpm --filter @schoolhub/api test
# real end-to-end flow against PostgreSQL (all migrations applied first)
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/schoolhub_test pnpm --filter @schoolhub/api test:e2e:2fa
```

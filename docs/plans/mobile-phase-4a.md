# Mobile Phase 4A · Native two-factor sign-in

Accounts enrolled in two-factor authentication can finish mobile sign-in
with a six-digit authenticator code or a saved backup code. Better Auth
continues to enforce its existing challenge expiry, per-account lockout,
rate limits and one-time backup-code use. Enrolment stays in the school
web portal.

The app keeps only the signed five-minute challenge cookie in memory and
stores the verified bearer token in SecureStore. Cancelling or changing
the session invalidates the challenge. There is no trusted-device option
in the mobile verification flow.

The API translates the app's `expo-origin` header only on email sign-in and
the two verification routes. Requests carrying a browser origin keep
their origin, and the web CORS and password-recovery policies continue to
use the existing web allowlist. This is the approved Phase 4A API change.
The unused general-purpose Expo auth client was removed.

PostgreSQL verification exercised both native verification methods and
then fetched school roles with the issued bearer token. The existing web
two-factor scenarios also passed. Verify cookie handling on the signed
Android and iOS builds before release.

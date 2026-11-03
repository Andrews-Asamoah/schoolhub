# Native two-factor sign-in spike

Status: **Deferred; no device-backed client approach selected.** This Phase 3.5
record does not authorize or include API changes.

## Findings

- The mobile client is currently a Better Auth bearer client. It obtains the
  native session token from the response header and keeps it in the existing
  session store; it does not persist the two-factor challenge cookie.
- The sign-in flow rejects `twoFactorRedirect` and directs the user to the
  school's web portal. `@better-auth/expo` is present in the mobile dependency
  list but is not used by the current auth client.
- The official Expo pair (server `expo()` plus mobile `expoClient()`) would
  involve both API configuration and a second cookie credential store. It has
  not been shown on a physical iOS/Android device to preserve the session
  store's generation guards.
- Narrow in-memory cookie handling has not been shown to expose the challenge
  cookie or reliably send the required native headers on both platforms.

## Conclusion

Neither approach has been validated on real devices, so this spike selects
neither approach and does not change the API, auth client, or dependency list.
Keep native two-factor deferred. A future Phase 4A spike must verify cookie and
header behavior on real iOS and Android clients before requesting approval for
an API change.

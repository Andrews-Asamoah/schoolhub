# Mobile Phase 4: shared shell

Branch: `feat/mobile-phase-4-shared`. Scope is the shared mobile experience for
teacher, student and guardian accounts; no API, web, shared-package or database
changes are included.

## Implemented

- Shared notifications, notification history and delivery preferences/history,
  including read actions, grouped days, loading/error/empty states and refresh.
- Shared inbox/sent messages, recipient lookup, message composition and inline
  thread details.
- Announcement list and detail views for all supported mobile roles.
- Profile, editable personal details, photo upload/removal, persisted appearance,
  mobile-role switching, sign-out, security guidance and academic context.
- School/role-scoped shared queries are excluded from persisted query data.
  Writes are online-only, session-generation guarded, and invalidate only their
  active school/role cache.
- Shared screens have component tests for their applicable loading, error,
  empty and successful states. Message-recipient lookup and notification
  preferences also cover refresh and retry behavior.

## Scope decisions and remaining work

- Trusted-device management endpoints exist in the route inventory but the
  controller restricts them to Super Admin. Super Admin is web-only, so the
  mobile client does not call or expose those endpoints. The Security screen
  directs users to the web portal for those settings.
- Teacher and student role landing screens are still stacks. Phase 5 adds the
  Guardian tab shell; teacher and student tab integration remains for Phases 6–7.
  The unread notification count is shown on the shared-tools Updates row; role
  tab badges still need to be connected as those shells are added.
- Native two-factor remains deferred pending the Phase 4A device spike and
  owner decision. No API trust-origin changes were made.
- Device/emulator acceptance, seeded-account runs and light/dark screenshots
  remain outstanding; automated tests do not substitute for those checks.

## Automated validation

The final command transcript is
[`foundation-final.txt`](../validation/mobile-phase-4/foundation-final.txt).
The implementation's automated checks pass; the phase remains pending its
manual device gate and future role-tab integration.

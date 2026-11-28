# Mobile Phase 8 · Push delivery

SchoolHub registers opted-in devices with the current authenticated school,
user, session and mobile role. A sign-out or role switch attempts device
deregistration with the existing scope. Server-side session revocation deletes
the binding, and the delivery worker validates the current binding, active
membership and subscription before sending.

The database queues a durable job with each eligible in-app notification.
Expo receives a generic alert and an opaque registration ID. The app opens
Updates only when the notification matches its current registration.
The worker tracks Expo receipts and removes retired tokens. External-exam
notifications are excluded from the push queue.

Set `EXPO_PUSH_ACCESS_TOKEN` in the API deployment and configure the Android
FCM and iOS APNs credentials in EAS. Apply both Phase 8 migrations before
starting the worker. Attendance replay keys expire after 30 days, beyond
the mobile queue's 14-day lifetime.

PostgreSQL integration checks cover transaction rollback, stable registration,
role isolation, filtering external-exam links, the generic push payload, provider
receipt handling and session-revocation cleanup. Physical-device delivery and
notification taps remain part of release acceptance.

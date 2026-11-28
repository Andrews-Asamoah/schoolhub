# Mobile Phase 8 · Offline attendance acceptance

The teacher app stores pending attendance in an AES-GCM encrypted queue,
with the key in Expo SecureStore. Existing queue entries keep their original
payload and idempotency key during migration. New saves contain changed
student IDs and attendance statuses. The API keeps existing attendance
remarks when a save omits them.

On app launch a teacher's queue is retained only after the API verifies
the saved session, school and remembered teacher role. If the app starts
offline, a reconnect screen preserves the queue while access is verified.
Sign-out, session expiry and role changes clear queued data.

The teacher workspace replays automatically in the foreground when
connectivity returns. Pending batches retain their order. When the server
rejects a batch permanently, the register displays the affected dates.
Teachers can also sync from the register directly.

Hardware acceptance remains open. Test a 500-pupil roster on low-end
Android, then verify airplane mode, app restart, ordered replay, a closed
school day, and account changes using the device acceptance checklist.

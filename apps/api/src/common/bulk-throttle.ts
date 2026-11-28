/**
 * Limit for batch endpoints (student import, photo upload, bulk scholarships, bulk report sign-off).
 * Each request already carries up to 25 rows or files and the routes are role-gated, so the default
 * 120/min is too tight for a large school while 300/min still blocks runaway scripts.
 * The throttler keeps a separate bucket per route and user, so this never borrows from normal browsing.
 */
export const BULK_THROTTLE = { default: { limit: 300, ttl: 60_000 } } as const;

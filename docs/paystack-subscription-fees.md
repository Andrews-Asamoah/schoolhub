# Paystack subscription fee policy

## Current main-branch baseline

Reviewed against `main` at commit `7086588fe4fecf115679fcb3a2bd21290f30c937` (2026-10-27). Existing `Subscription` and `InvoiceRecord` models already contain Paystack-related fields. The SuperAdmin API currently handles school lifecycle and manual subscription status changes; it does not yet expose a complete Paystack checkout/webhook lifecycle. Extend the existing billing models rather than creating duplicate subscription or invoice tables.

## Ghana fee estimate

Paystack's published standard Ghana pricing lists a 1.95% transaction fee. A merchant's negotiated pricing may differ, so confirm the Drew Tech account's effective rate with Paystack before enabling production checkout.

Checkout should transparently show:
- Subscription price (the amount SchoolHub should receive)
- Estimated Paystack processing fee
- Total due (subscription price plus the estimated fee)

The fee applies to the amount charged, including the pass-through portion. Simply adding 1.95% of the base price can leave a shortfall. Use integer pesewas and gross up the total to the smallest amount where total minus the estimated fee covers the subscription price.

Example at 1.95%:
- Subscription price: GHS 100.00
- Estimated Paystack fee: GHS 1.99
- Total due: GHS 101.99

These values are estimates for checkout display, not authoritative settlement data. Persist the base amount, estimated fee, total due, currency, fee rate, Paystack reference, and verified actual transaction status for reconciliation. Never activate a subscription from a browser redirect alone. Verify the transaction server-side, validate reference, amount and currency, authenticate webhooks using the raw request body and Paystack signature, and process events idempotently. Never trust client-supplied prices or expose the secret key.

Paystack's current guidance says non-Nigerian merchants should contact Paystack to arrange automatic fee pass-through; markup is the alternative. Confirm merchant eligibility and the effective rate before production. Do not enable both provider-side fee pass-through and SchoolHub's gross-up, or the fee may be charged twice.


## Subscription plan catalogue and capacity enforcement

The superadmin portal now has a dedicated **Subscription plans** page at `/admin/plans`.
It supports creating and editing a plan's stable code, display name, monthly and annual price,
currency, public visibility, active state, sort order, feature entitlements, and nullable
student/teacher/guardian/staff/storage limits. A null capacity is unlimited; zero is a real
zero-capacity limit. Plans are deactivated rather than hard-deleted.

A school plan is assigned from **Superadmin → Subscriptions → Manage**. Assignment snapshots
the selected plan's price, currency, billing cycle and person limits onto that school's
subscription, and is audit-logged. The API rejects assignment if the school's current active
record count already exceeds a proposed limit, preserving existing school data and preventing
a downgrade from creating an immediately inconsistent entitlement state.

Student, teacher, guardian and staff creation checks run server-side inside the write transaction.
The quota helper takes a per-school PostgreSQL transaction advisory lock before checking current
usage so concurrent create requests cannot simply race past the same cap. No limit is enforced
when a school has no subscription record or the corresponding limit is null.

**Operational rollout:** deploy the migration before deploying API code. Regenerate Prisma Client
with the repository's `pnpm --filter @schoolhub/api prisma:generate` command. Configure plans
and explicitly assign them to schools; existing schools are not silently moved to a new plan.
Storage caps and feature entitlements are catalogue fields in this phase and must not be treated
as enforced until each relevant upload/feature API is wired to those entitlements. Guardian records
created as part of student enrollment are checked inside the same transaction as well.

The Paystack checkout/verification/webhook lifecycle remains a separate follow-on phase; fee
calculation helpers alone do not constitute a payment integration.

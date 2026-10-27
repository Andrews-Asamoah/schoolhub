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

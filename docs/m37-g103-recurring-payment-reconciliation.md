# M37 G1-03 — recurring subscription payment reconciliation

Status: PARTIAL IMPLEMENTATION IN DRAFT; NOT ACCEPTANCE-TESTED. G1-01/G1-02 Sandbox acceptance remains PASS. No Production changes authorised.

Implementation progress: `supabase/functions/gpir-paypal-webhook/recurring-sale.mjs` handles provider-verified `PAYMENT.SALE.COMPLETED` subscription renewals through the restricted ledger writer; `handler.mjs` routes the event after signature verification and idempotent event claim. `tests/m37/g103-renewal.test.mjs` adds synthetic renewal/duplicate/mismatch tests, and Gate 1 CI includes that file. CI result for the new head, deployed Sandbox acceptance, production RPC compatibility, recurring refund/reversal evidence and entitlement integration are **not yet confirmed**. This document does not mark G1-03 PASS.

## Scope
Handle provider-confirmed recurring billing after the original subscription payment. Do not create a new checkout or reuse the original USD 9.99 transaction as a renewal fixture. A PayPal subscription ACTIVE state or a browser return is not proof of a new payment.

## Server-side processing contract
1. Receive a PayPal webhook through the existing signature-verification boundary. Reject unverified events before any database mutation. Claim event idempotently using existing provider event claim RPC.
2. For subscription payment events, identify the PayPal subscription, fetch its current provider details and subscription-specific transactions from PayPal server-side, and match provider custom_id, PayPal plan, local subscription, environment, currency, amount and transaction identity. Do not rely on untrusted event amount alone. Confirm transaction status COMPLETED and its provider timestamp.
3. Record each *new* verified transaction through restricted service-role writer, using unique (environment, transaction ID) and provider event protection. A replay of identical evidence is DUPLICATE (safe acknowledgement); conflicting evidence is CONFLICT (no entitlement).
4. Never treat a missing, pending, mismatched, ambiguous or paginated/unresolved provider transaction as paid. Record an actionable retry/error without falsely marking the event processed. Design a bounded provider-history lookup rather than assuming approval-return's last-30-day window covers renewals.
5. Distinguish one-time capture event handling from subscription recurring payment handling; avoid double counting a payment across event types.
6. Handle subscription payment failure and status changes using provider-verified lifecycle data. Refunds and reversals must identify the original transaction, persist auditable negative/reversal evidence or a governed state transition, and trigger entitlement re-evaluation. Do not overwrite original payment evidence without an audit trail.
7. Only server-side entitlement policy may grant or revoke publication access. The reader dashboard must reflect billing and entitlement separately, with reader A/B isolation.
8. Keep Sandbox/Production separation, least-privilege RPC grants, no browser ledger write permissions, and no secret disclosure.

## Required tests before G1-03 PASS
- Initial payment replay: exactly one evidence record; no new charge.
- First renewal and second renewal: distinct provider transaction IDs, each exactly once.
- Duplicate delivery, concurrent replay and conflicting event/transaction IDs.
- Wrong reader, custom_id, plan, environment, amount, currency, timestamp, or provider status: no ledger write/access.
- Missing provider transaction, provider outage, incomplete pages, delayed/out-of-order delivery: safe retry, no false success.
- Payment failure, suspension, cancellation, expiry, refund and reversal: governed billing and entitlement behavior; original audit retained.
- Unverified signature and anonymous/authenticated direct ledger access denied.
- Reader A/B isolation; active billing without verified payment never implies publication access.
- Rollback-only synthetic SQL tests in disposable DB; Node regression CI; separate controlled Sandbox provider-event acceptance.

## Release prerequisites
Read-only Production schema/migration/RPC preflight; inspect legacy LIVE rows; confirm environment-specific PayPal credentials/webhook ID/allowed origins/plan mapping by presence and scope only; verify deployed entitlement RPC and webhook subscriptions. PR #466 stays Draft until tests and owner release authorisation. No Production migration, flag activation, live merchant mutation, checkout or merge from this specification.

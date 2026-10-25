# M37 G1-03 — recurring subscription payment reconciliation

Status: SANDBOX RELEASE CANDIDATE IN DRAFT; MOCKED INTEGRATION TESTS PASS; LIVE SANDBOX ACCEPTANCE BLOCKED. G1-01/G1-02 Sandbox acceptance remains PASS. No Production changes authorised.

Implementation progress: `supabase/functions/gpir-paypal-webhook/recurring-sale.mjs` handles provider-verified `PAYMENT.SALE.COMPLETED` subscription renewals, records distinct evidence and advances the verified billing period. `recurring-adjustment.mjs` handles `PAYMENT.SALE.REFUNDED` and `PAYMENT.SALE.REVERSED` only after matching the original local evidence, authoritative reader-owned subscription and PayPal transaction history. Migration `20261025000100_m37_g103_recurring_adjustments.sql` adds immutable adjustment audit, the ownership-complete v3 lookup and restricted adjustment writer. The consolidated local Gate 1 suite is 74/74 PASS. The migration has not been applied, the function has not been deployed and no real Sandbox renewal/refund/reversal event has been accepted. This document does not mark G1-03 fully accepted.

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

## Corrected database and provider contracts

- Existing `gpir_get_paypal_subscription_for_webhook_v2(uuid,text,text)` returns exactly `local_subscription_id`, `paypal_subscription_id`, `provider_request_id`, `paypal_plan_id`, and `subscription_status`; it does not return `user_id`. G1-03 preserves v2 and uses new service-only `gpir_get_paypal_subscription_for_webhook_v3(uuid,text,text)`, which adds `user_id` selected from `gpir_paypal_subscriptions`.
- `gpir_record_verified_subscription_payment_v1(uuid,uuid,text,text,text,text,bigint,timestamptz,text,text)` returns `RECORDED`, `DUPLICATE`, `CONFLICT` or `REJECTED`. Renewal callers accept only the first two.
- Existing webhook claim/completion remain `gpir_claim_paypal_webhook_event_v2(text,text,text,text,timestamptz,text) -> text` and `gpir_finish_paypal_webhook_event_v2(text,text,text,text) -> boolean`.
- New `gpir_get_subscription_payment_for_webhook_v1(text,text)` resolves an original PayPal sale transaction to its immutable evidence, reader, local subscription and plan. New `gpir_record_subscription_payment_adjustment_v1(uuid,uuid,text,text,text,text,text,text,text,timestamptz) -> text` records the provider event and adjustment identity without inserting a second payment.
- PayPal webhook payload values remain hints. The handler verifies the signature with PayPal, re-fetches `/v1/billing/subscriptions/{id}`, and re-fetches `/v1/billing/subscriptions/{id}/transactions` for a bounded period around the original payment. `COMPLETED`, `PARTIALLY_REFUNDED` and `REFUNDED` are accepted only in the event-appropriate path.
- A partial refund leaves the current subscription access period unchanged. A full refund or reversal expires only the affected latest period; an eligible later payment prevents an older adjustment from removing current access. The subscription billing status remains controlled by subscription lifecycle events.

## Sandbox deployment proposal — owner approval required

Apply no changes until owner approval. For project `hoewtptllwkcqrgryazu`, use this order:

1. Confirm the existing M37-B/M39 payment boundary and G1-01/G1-02 migrations/RPCs are present. Do not reapply already-recorded migrations.
2. Apply `20261025000100_m37_g103_recurring_adjustments.sql` transactionally and verify the new table/RPC signatures, RLS, grants and unchanged v2 contract.
3. Deploy `gpir-paypal-webhook` from this branch. Its bundle must include `handler.mjs`, `recurring-sale.mjs`, `recurring-adjustment.mjs`, `_shared/gpir-paypal.mjs` and `_shared/gpir-subscription-payment-reconciliation.mjs`.
4. Keep Supabase gateway JWT verification disabled for this webhook only (`--no-verify-jwt`), because PayPal cannot send a Supabase JWT. The function must continue to verify the PayPal signature before database mutation. This setting is not permission to disable JWT verification on reader-facing functions.
5. Confirm secret/configuration names by presence only: `SUPABASE_URL`, `GPIR_SUPABASE_PUBLISHABLE_KEY`, `GPIR_SUPABASE_SECRET_KEY`, `PAYPAL_ENVIRONMENT=sandbox`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_WEBHOOK_ID`. `GPIR_PAYPAL_PRODUCTION_ENABLED` must not enable Production.
6. On the PayPal Sandbox REST app that owns the subscription, confirm the webhook URL and registered webhook ID use the same app credentials and subscribe at minimum to `PAYMENT.SALE.COMPLETED`, `PAYMENT.SALE.REFUNDED`, `PAYMENT.SALE.REVERSED`, `BILLING.SUBSCRIPTION.ACTIVATED`, `BILLING.SUBSCRIPTION.SUSPENDED`, `BILLING.SUBSCRIPTION.CANCELLED`, `BILLING.SUBSCRIPTION.EXPIRED`, and `BILLING.SUBSCRIPTION.PAYMENT.FAILED`. Preserve existing one-time events `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, and `PAYMENT.CAPTURE.REVERSED`.
7. Perform controlled live Sandbox acceptance with naturally occurring or owner-approved provider events; do not create another payment solely for this check. Verify evidence count, adjustment audit, event idempotency, period update, partial/full entitlement behavior and Reader A/B isolation.

Read-only cloud inspection was unavailable in the implementation environment: no Supabase CLI, access token, database password or PayPal credentials were present. Actual RPC availability, deployed JWT setting, secret-name presence and PayPal webhook subscriptions therefore remain blocked on an authorised private Sandbox session. Production project `qlnvhfapctcpzqyuhhth` was not accessed.

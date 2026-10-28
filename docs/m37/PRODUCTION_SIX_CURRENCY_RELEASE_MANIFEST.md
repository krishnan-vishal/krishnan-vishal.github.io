# M37 — Six-Currency Production Release Manifest (HOLD / DISABLED)
Date: 2026-10-27
Base: production main
Source under review: feature/onetime-multicurrency-sandbox / PR #468
Production activation: NOT AUTHORIZED; no real-money transactions required for readiness testing.

## Scope
One-time Premium Library, nonrenewing 30-day access, 9.99 per currency: USD, EUR, GBP, SGD, AUD, CAD. Existing monthly subscriptions remain unchanged.

## Evidence
Sandbox: 11 distinct CAPTURED payments across all six currencies; 11 ACTIVE Premium Library entitlements with exactly 30-day duration. PayPal/card browser buttons observed. This does not establish Production merchant eligibility, reader dashboard authorization or negative-case protection.

## Production read-only inventory
Production Supabase project qlnvhfapctcpzqyuhhth has no gpir_onetime_offers, gpir_onetime_orders, gpir_onetime_library_entitlements, or gpir_onetime_webhook_events tables. No gpir-onetime-create-order, gpir-onetime-capture-order, or gpir-onetime-webhook deployed. Existing recurring PayPal functions are ACTIVE.

## Exclusions from production promotion
- Do NOT merge PR #468 wholesale (37 files; broader seven-currency draft scope).
- Do NOT promote sandbox/checkout-six-currency/config.js (Sandbox project URL/key).
- Do NOT promote assets/js/gpir-payonce-multicurrency.mjs unchanged: it hard-codes the Sandbox Supabase URL and seven currencies including JPY, and contains older destructive PayPal SDK reload behavior.
- Do NOT infer Production funding-method eligibility from Sandbox.
- No live transaction by owner; first real reader purchase can be monitored post-activation.

## Required narrow release implementation and verification
1. Identify exact approved additive migration and row-level security policies; ensure recurring and publication access stay unchanged.
2. Port the verified six-currency isolated namespace SDK loader, not the older seven-currency implementation.
3. Prepare Production environment-specific server handlers and origin allowlist; do not expose PayPal secrets. Keep one-time checkout feature flag OFF and page non-purchasable.
4. Resolve repeat-purchase policy (extend versus overlap), idempotency, failed/canceled/pending and refund/reversal behavior.
5. Validate reader authorization, entitlement visibility and expiry with non-monetary tests.
6. Review merchant Live API credentials, supported currencies, and webhook signature verification without charging.
7. Obtain explicit approval before any Production migration, function deployment, merge to main or live checkout activation.

## Gate result
This branch is a safe documentation-only release preparation branch. It does not deploy, modify production tables, create payment endpoints, or activate payments.

## Final implementation update — 2026-10-28

PR #469 is no longer documentation-only: it contains the disabled Production Edge handlers, verified webhook reconciliation, delayed-capture recovery and My GPIR ledger/pass integration. Read-only Production verification confirms the additive schema/RPC package and resolver are installed, all six offers remain disabled, and the M37 ledgers remain empty. The code is ready for owner release review after local and GitHub checks; no function was deployed and no payment was activated by this update.

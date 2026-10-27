# M37 — Controlled Production Release Gate (Prepared, Not Activated)

Date: 2026-10-27
Source: feature/onetime-multicurrency-sandbox @ b63b8ca646bc8b8546fd8a25f8535763ae35e324
Status: PREPARED / PRODUCTION PAYMENT ACTIVATION DISABLED

## Verified Sandbox baseline
- AUD, CAD, EUR, GBP, SGD, USD each 9.99, 30-day nonrenewing Premium Library access.
- 11 distinct captured Sandbox payments and 11 corresponding ACTIVE library entitlements with exact 30-day duration.
- Six currency PayPal SDK switching acceptance reported PASS.
- No live test transaction required for release.

## Read-only Production discovery
- Production project: qlnvhfapctcpzqyuhhth.
- Production lacks gpir_onetime_offers, gpir_onetime_orders, gpir_onetime_library_entitlements, gpir_onetime_webhook_events.
- Production lacks gpir-onetime-create-order, gpir-onetime-capture-order and gpir-onetime-webhook Edge Functions.
- Existing recurring subscription functions are deployed and must remain untouched.
- PR #468 remains draft; it contains unrelated/broader changes. DO NOT MERGE WHOLE PR.

## Controlled release sequence
1. Review isolated checkout migration, RLS, entitlements and server-side verification for production compatibility. Define repeat-purchase extension policy and ensure no duplicate access from replay.
2. Review Production PayPal merchant capabilities, currencies, merchant credentials and webhook registration without initiating any payment. Never expose credentials in static files or logs.
3. Prepare narrow production branch/PR from main with only approved migration, one-time server functions, entitlement resolver integration and disabled checkout UI. Preserve recurring subscription code and public site behavior.
4. Apply additive migration only after explicit schema/security approval; deploy server functions with environment-specific secrets and restrictive origin; keep ONETIME_CHECKOUT_ENABLED=false.
5. Run non-monetary tests: auth, six offers, server-side amount enforcement, fail-closed feature flag, signature verification, RLS, no access on canceled/pending/failed states, replay/idempotency, reader access rules, recurring regression.
6. Deploy static checkout only with payment actions disabled; verify live pages and reader navigation, no broken routes.
7. Separate owner approval required to enable live payments. First independent reader payment is monitored for server-verified capture and entitlement, without owner test purchase.

## Hold points
- No Production changes were authorized beyond safe preparation and disabled staging until dependencies and tests pass.
- No Production SQL DDL, function deployment, secrets changes, main merge, or live payment activation has been performed by this preparation record.
- Never treat Sandbox PayPal eligibility as proof of all international local funding methods in Production.

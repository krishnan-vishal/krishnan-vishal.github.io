# GPIR One-Time Multicurrency Sandbox — Implementation Design (Approval Stage)

Status: DESIGN ONLY. No checkout code, Supabase migrations, PayPal configuration, deployments, or production changes authorized by this document.

## Isolation and invariants
- Work only on branch `feature/onetime-multicurrency-sandbox` (created from `main`).
- Never change existing subscription, dashboard, authentication, webhook, entitlement resolver, payment tables, or existing production feature flags without a separate exact-diff approval.
- New Deno Supabase Edge Functions MUST refuse requests unless `PAYPAL_ENV=sandbox` and `SUPABASE_URL=https://hoewtptllwkcqrgryazu.supabase.co`. Pin PayPal to `https://api-m.sandbox.paypal.com`. No live fallback.
- Keep secrets in Sandbox Edge Function secrets only. Feature flag `ONETIME_CHECKOUT_ENABLED` defaults to false and is required true for all new endpoints and UI.
- No link from the live dashboard until separately approved; direct standalone preview route only.

## Proposed additive files
- `reader/pay-once/index.html` — standalone checkout page, separate PayPal SDK namespace.
- `assets/js/gpir-payonce-multicurrency.mjs` — currency selector, eligible funding buttons, error/pending/success UX.
- `supabase/functions/gpir-onetime-create-order/index.ts` and `handler.mjs`.
- `supabase/functions/gpir-onetime-capture-order/index.ts` and `handler.mjs`.
- `supabase/functions/gpir-onetime-webhook/index.ts` and `handler.mjs`.
- `supabase/functions/_shared/gpir-onetime-sandbox.mjs` — independent sandbox-only OAuth, CORS, authentication, price lookup, idempotency and PayPal calls.
- `supabase/migrations/<timestamp>_gpir_onetime_sandbox.sql` — new `onetime_purchases` store and strictly scoped RPCs only; do not alter existing tables.
- `tests/m37/onetime-multicurrency.test.mjs` — sandbox isolation, JPY decimals, duplicate capture, signature rejection, refund, amount tampering and flag OFF.

## API contract
- `POST /functions/v1/gpir-onetime-create-order` accepts `{currency, passId, requestId}`; server authenticates Sandbox Supabase reader JWT, verifies a server-maintained offer table, inserts idempotent local order, creates PayPal Orders v2 CAPTURE with `PayPal-Request-Id`, internal unique invoice ID and authenticated reader reference. Return PayPal order ID only after persisted linkage.
- `POST /functions/v1/gpir-onetime-capture-order` accepts `{orderID}`; require order ownership, retrieve and capture via PayPal, verify order/capture IDs, exact currency and amount, and COMPLETED before one atomic entitlement write. Pending must not grant access. Repeat calls return existing verified result without duplicate access.
- `POST /functions/v1/gpir-onetime-webhook` must validate PayPal signature against a NEW webhook ID before writing; deduplicate provider event IDs; reconcile completed/pending/denied/refunded states. Refund revocation must not inadvertently remove a separately active subscription.
- Cache OAuth token in function process memory until shortly before expiry, but support stateless cold starts.
- Log only safe request IDs, order IDs and status; never tokens or PII.

## Currency and checkout
- Allowed USD, EUR, GBP, SGD, AUD, JPY, CAD; prices and 30-day duration are placeholders pending owner approval. No non-USD payment enabled until pricing is approved.
- JPY is zero decimal (e.g. `1500`); other listed currencies have two decimals. Use integer minor-unit arithmetic, not floats.
- SDK loaded only on standalone page, `data-namespace=paypal_onetime`, `intent=capture`, currency-specific SDK reload. Render wallet, card and local methods only if eligible. No guarantee of guest card or local bank availability.
- Show processing, cancelled, declined, pending, completed with verified expiry date.

## Entitlement integration hold
The existing reader dashboard relies on `gpir-reader-summary` and `resolve_publication_entitlement`. New purchase data cannot automatically grant existing protected-publication access. Build and test an independent pass lookup first. BEFORE any shared resolver/dashboard wiring, present exact diff for owner approval. Never claim complete access before that integration.

## Phase 1 manual PayPal Sandbox prerequisites (NOT verified)
1. Confirm existing sandbox business merchant country and whether guest checkout is enabled.
2. Confirm which of seven currency balances can receive/settle.
3. Check Advanced Card Fields eligibility; fall back to eligible standard card button.
4. Set up buyer accounts/test cards for US, GB, SG, AU, JP, CA and NL/DE/BE.
5. Create distinct Sandbox webhook for `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.PENDING`, `PAYMENT.CAPTURE.DENIED`, `PAYMENT.CAPTURE.REFUNDED`.
6. Store Sandbox client ID/secret and new webhook ID only in Sandbox secrets.
These cannot be confirmed or performed with current GitHub-only connector access.

## Acceptance and release
- Test seven wallet currencies, seven guest-card currencies when eligible, eligible bank methods, duplicate capture, refunds, tampered amounts, negative signature, feature flag OFF and existing subscription regression.
- Record real sandbox order/capture IDs only when testing occurs; do not fabricate results.
- Create draft PR from this branch only after additive implementation review. Do not merge, deploy to production or change DNS.
- Rollback: disable flag, disable new Sandbox webhook, close PR. Existing subscription remains untouched.

## Outstanding decisions
- Pass duration (proposed 30 days).
- Exact prices for all seven currencies.
- Which publications a pass grants access to.
- Separate PayPal Sandbox app vs reuse existing Sandbox app.
- Approval of exact shared-code entitlement wiring diff after independent functionality passes.

## Owner direction — PayPal-governed international acceptance (2026-10-25)
- Do not hardcode promises that every payment method works in every currency or jurisdiction. PayPal merchant and buyer eligibility, merchant onboarding, risk controls and the SDK's funding-source `isEligible()` result govern the visible options.
- Provide the seven requested checkout currencies as selectable *only after* the server-side price for each currency is approved and configured. If a currency is unavailable to the merchant or PayPal declines it, show a clear, non-looping unavailable message and offer another configured currency; never silently convert amounts.
- Keep a single standalone checkout page and one PayPal SDK instance per currency selection. Tear down the prior SDK and buttons before switching currencies; use `data-namespace=paypal_onetime` to avoid the existing subscription SDK.
- Render PayPal wallet, guest card and local APM buttons individually only when PayPal reports eligibility. Avoid an exhaustive country-by-country custom funding matrix or bespoke bank integrations.
- PayPal guest-card availability and local-bank availability are conditional, not guaranteed. A successful capture, not SDK eligibility or buyer approval alone, triggers access.
- Use one narrow Sandbox acceptance pass: seven currency formatting/server-price checks, representative eligible wallet and guest-card flows, any available local APM, pending/denied/refund, idempotency and recurring-subscription regression. Record unavailable methods as NOT ELIGIBLE rather than repeatedly retrying.
- Never run real payments or deploy to production. Existing Phase 1 merchant settings and price decisions remain pending; no PayPal merchant eligibility has yet been verified.

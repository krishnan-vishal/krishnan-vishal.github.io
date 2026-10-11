# M37-B — FINTECHOISIS GPIR PayPal Sandbox Integration

**Implementation state:** local branch only; review and sandbox configuration required

**Branch:** `codex/m37-b-paypal-sandbox`

**Production mutations:** none

**Live checkout:** not implemented or enabled

## 1. Read-only architecture and payment-boundary inventory

The inspection completed before implementation found these authoritative boundaries:

| Concern | Current authority | M37-B rule |
|---|---|---|
| Reader identity | Supabase Auth, initialized by `gpir-reader-auth.js` | Reuse the authenticated Supabase bearer token; do not create a PayPal identity system. |
| Publication identity | `gpir_identity_publications` and immutable GPIR publication IDs | Every offer and purchase grant binds the exact Supabase record UUID and GPIR publication ID. |
| Access policy | `gpir_publication_access_policies` | Keep the existing `PUBLIC` / `AUTHENTICATED` / `ENTITLED` policy classes. |
| Access decision | `resolve_publication_entitlement` | Preserve the single `ALLOW` / `DENY` RPC and add a verified one-time-purchase condition only for `ENTITLED` policies. |
| Existing general entitlement | `gpir_user_access_profiles` | Leave unchanged. This remains the subscription/general entitlement path. |
| Protected content | `gpir-protected-publication`; local in-progress `gpir-paid-publication` private delivery boundary | Payment code never returns protected content and does not weaken content delivery checks. |
| Frontend | Static GitHub Pages HTML/CSS/vanilla JS using shared GPIR tokens and typography | Add an isolated `noindex` sandbox preview; do not add a live navigation entry. |
| Payments before M37-B | None | No PayPal tables, checkout functions, webhook handler, or payment-triggered grants existed. |

The checkout and entitlement boundaries are deliberately separate:

1. The browser supplies an offer UUID, never a price.
2. The create-order function authenticates the GPIR reader and resolves the active sandbox offer on the server.
3. PayPal creates the order using the server-authoritative amount.
4. The browser's approval callback asks the capture function to capture; it does not grant access.
5. The capture function validates the PayPal order ID, local order ID, currency, exact amount and completed capture.
6. One database transaction records the capture and activates the publication-specific purchase grant.
7. The existing entitlement RPC makes the final access decision.
8. A separately verified webhook provides asynchronous reconciliation and revocation.

## 2. Proposed database migration

The review-only migration is `supabase/migrations/20261011000000_m37b_paypal_sandbox.sql`.

It adds four RLS-protected, service-role-only tables:

- `gpir_payment_offers`: sandbox-only server price and publication mapping.
- `gpir_payment_orders`: PayPal order/capture reconciliation and idempotency state.
- `gpir_publication_purchase_entitlements`: a publication-specific grant whose source is a captured order.
- `gpir_payment_webhook_events`: hashed, minimal webhook processing ledger with retry-safe event IDs.

It does not store card data, PayPal access tokens, client secrets, raw webhook bodies, or buyer email addresses. It grants no direct table access to `anon` or `authenticated`.

The migration adds service-role-only RPCs for order preparation, provider-order attachment, capture finalization, webhook claiming/completion, and refund/reversal processing. Capture finalization atomically checks the stored amount/currency before activating a grant.

`resolve_publication_entitlement` retains every existing branch and accepts an active purchase grant as an additional condition for an `ENTITLED` publication. Existing global reader access continues to use `gpir_user_access_profiles` unchanged.

No offer is seeded because the owner must approve the publication, price and currency. An approved sandbox offer would be inserted only after the migration is applied to an isolated development Supabase project:

```sql
INSERT INTO public.gpir_payment_offers
  (supabase_record_id, publication_id, sku, display_name,
   currency, unit_amount_minor, status)
VALUES
  ('<governed-publication-record-uuid>', '<matching-gpir-publication-id>',
   '<owner-approved-sku>', '<owner-approved-title>', 'USD',
   <owner-approved-price-in-cents>, 'SANDBOX_ACTIVE');
```

## 3. Edge Functions

| Function | Authentication | Responsibility |
|---|---|---|
| `gpir-paypal-create-order` | Valid Supabase reader session | Resolve offer, reserve an idempotent local order, obtain PayPal OAuth token, create sandbox Orders v2 order, reconcile provider ID. |
| `gpir-paypal-capture-order` | Same reader; must own local order | Capture the approved order, validate completed capture/identity/amount/currency, atomically create the purchase grant. |
| `gpir-paypal-webhook` | PayPal signature postback verification | Claim event ID, fetch authoritative PayPal order data, finalize completed captures, revoke refunded/reversed purchases, ignore unrelated events. |

All PayPal URLs are fixed in code to `https://api-m.sandbox.paypal.com`. Configuration fails closed unless `PAYPAL_ENVIRONMENT=sandbox`. There is no live base URL switch.

Required Edge Function secrets/configuration:

```text
SUPABASE_URL
GPIR_SUPABASE_PUBLISHABLE_KEY
GPIR_SUPABASE_SECRET_KEY
GPIR_PAYPAL_ALLOWED_ORIGINS
PAYPAL_ENVIRONMENT=sandbox
PAYPAL_CLIENT_ID
PAYPAL_CLIENT_SECRET
PAYPAL_WEBHOOK_ID              # webhook function only
```

`PAYPAL_CLIENT_SECRET`, `GPIR_SUPABASE_SECRET_KEY` and OAuth access tokens must be configured only as Supabase Edge Function secrets. They must not be placed in frontend code, Git, test output, request responses or application logs.

## 4. Sandbox checkout

`assets/js/gpir-paypal-sandbox-checkout.mjs` loads the official PayPal JavaScript SDK, creates orders through the Edge Function, and asks the capture Edge Function to verify/capture after approval. It marks success only when the server returns both `CAPTURED` and `SERVER_VERIFIED`.

`artifacts/m37-b/paypal-sandbox-checkout.html` is an isolated, `noindex` preview that reuses GPIR fonts, colors and reader-auth plumbing. Its client ID and offer ID are inert placeholders. The PayPal client ID is public by design; the client secret is never accepted by the module.

The preview is not linked from production pages and no deployment has been performed.

## 5. Webhook configuration and reconciliation

After deploying only to an isolated development Supabase project, register this sandbox listener on the **FINTECHOISIS-GPIR Sandbox Merchant** REST application:

```text
https://<development-project>.supabase.co/functions/v1/gpir-paypal-webhook
```

Subscribe at minimum to:

- `PAYMENT.CAPTURE.COMPLETED`
- `PAYMENT.CAPTURE.REFUNDED`
- `PAYMENT.CAPTURE.REVERSED`

The handler posts the original event JSON and PayPal transmission headers to PayPal's `verify-webhook-signature` API. Only `SUCCESS` proceeds. `provider_event_id` is unique; processed and ignored duplicates return HTTP 200 without repeating fulfillment. Failed processing is marked `ERROR` and can be retried. Payloads are represented in the ledger by SHA-256 only.

Webhook completion independently fetches the PayPal order and repeats the identity, amount and currency checks. A webhook body alone is never sufficient to activate access.

## 6. Subscription boundary

Subscriptions are intentionally not implemented in M37-B. No subscription table, plan, button or entitlement writer was created.

Before subscription work begins, the owner must confirm live PayPal Business eligibility, approve the commercial product/plan and billing/recovery policy, and authorize a separate live-readiness phase. That phase should store provider subscription reconciliation separately but continue to express reader access through the existing `gpir_user_access_profiles` authority. It must not create a second subscription-entitlement decision path.

## 7. Test plan

Automated tests cover:

- sandbox-only configuration and fixed PayPal API host;
- server-side offer/price authority;
- create-order and capture idempotency;
- reader authentication and order ownership;
- exact order, local UUID, capture, currency and amount matching;
- no grant for redirect/approval, pending, denied or mismatched captures;
- PayPal webhook signature failure and successful verification;
- webhook duplicate suppression and completed-capture reconciliation;
- refund/reversal grant revocation path;
- RLS, grants and secret absence from frontend sources;
- preservation of the existing entitlement decision surface.

Recommended isolated integration cases also include PayPal sandbox success, buyer cancellation, duplicate button click, expired session, OAuth failure, Orders API timeout/retry, webhook-before-browser-capture, browser-capture-before-webhook, refund, reversal, wrong webhook ID and altered payload.

Local validation on 11 October 2026: **10/10 M37-B tests pass** and **69/69 combined payment, auth, entitlement and protected-delivery regression tests pass**. JavaScript syntax checks also pass. The migration was not executed because this workspace has neither Supabase CLI nor PostgreSQL client access; it remains review-only as required.

## 8. Controlled activation checklist

1. Review and approve this architecture and migration.
2. Create or select a non-production Supabase project and confirm it contains the prerequisite M35/M34 schema.
3. Apply the migration only to that project.
4. Configure Edge secrets from the FINTECHOISIS-GPIR Sandbox Merchant app; never paste them into repository files.
5. Deploy the create/capture functions only to the development project with normal JWT verification. Deploy the webhook function with JWT verification disabled for that function only; PayPal authenticates through the verified transmission signature, not a Supabase reader JWT.
6. Register the development webhook URL and store its returned webhook ID as a secret.
7. Insert one owner-approved `SANDBOX_ACTIVE` offer.
8. Replace only the preview's public sandbox client ID and offer UUID through development configuration.
9. Run automated tests, PayPal sandbox buyer tests and database reconciliation queries.
10. Obtain explicit owner approval before any production migration, production function deployment, live credential configuration or live checkout UI change.

## 9. Rollback

No rollback is currently required because nothing was deployed.

For a future development deployment:

1. Disable/remove the sandbox checkout preview and deactivate all `SANDBOX_ACTIVE` offers.
2. Unregister the sandbox webhook in PayPal or disable its event subscriptions.
3. Undeploy `gpir-paypal-create-order`, `gpir-paypal-capture-order` and `gpir-paypal-webhook`.
4. Export the payment-order and webhook ledgers if the test audit trail must be retained.
5. Run `supabase/rollback/20261011000000_m37b_paypal_sandbox.rollback.sql` in the development project.
6. Confirm `resolve_publication_entitlement` again uses only the original public/authenticated/global-profile rules.
7. Rotate the sandbox client secret and remove the webhook ID secret if the environment is retired.

The rollback leaves Supabase Auth, identity tables, publication policies, global access profiles, protected-publication functions, Contentful, FX, CMS and ingestion code untouched.

## 10. External references checked

- PayPal Orders v2 integration: https://developer.paypal.com/api/rest/integration/orders-api
- PayPal REST authentication and sandbox base URL: https://developer.paypal.com/api/get-started/
- PayPal webhook verification: https://developer.paypal.com/api/rest/webhooks/rest/
- PayPal JavaScript SDK reference: https://developer.paypal.com/sdk/js/v1/reference
- PayPal subscriptions overview: https://developer.paypal.com/platforms/subscriptions/

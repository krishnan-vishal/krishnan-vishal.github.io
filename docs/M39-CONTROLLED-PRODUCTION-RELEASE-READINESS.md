# M39 — Controlled Production Release Readiness

Date: 2026-10-15

Branch: `work/m37-m38-sandbox-completion`

Implementation state: release candidate; production activation disabled

Production mutations: none

## Outcome

M39 preserves the accepted M37 Sandbox one-time purchase flow and M38 My GPIR
dashboard while adding an explicit Sandbox/Production payment boundary and a
server-verified PayPal subscription lifecycle. The repository contains no
active production offer or plan, no live PayPal client configuration, and no
public production checkout.

The My GPIR layout, five-section navigation, stable routes and Supabase reader
authentication controls are unchanged. Its backend now scopes offers, orders,
purchase entitlements and subscriptions to its configured environment. The
dashboard exposes reduced plan state only; PayPal subscription identifiers and
server credentials are never returned to the browser.

## Environment boundary

| Environment | Supabase project | PayPal API | Active catalogue state |
|---|---|---|---|
| Sandbox | `hoewtptllwkcqrgryazu` | `https://api-m.sandbox.paypal.com` | `SANDBOX_ACTIVE` |
| Production | `qlnvhfapctcpzqyuhhth` | `https://api-m.paypal.com` | `LIVE_ACTIVE` |

The Edge configuration rejects an unknown environment, a mismatched Supabase
project, missing credentials, or production without
`GPIR_PAYPAL_PRODUCTION_ENABLED=true`. Provider base URLs are selected from the
fixed internal map and cannot be supplied by the browser or deployment input.

The isolated Sandbox preview now generates both its Supabase browser config and
checkout config in memory. It refuses checkout configuration without the
approved Sandbox publishable key, PayPal client ID and offer UUID. The committed
Sandbox checkout HTML contains no production project or function endpoint and
cannot fall back to the checked-in production Supabase browser configuration.

## Subscription integration

The append-only migration adds service-role-only subscription plan and
subscription reconciliation tables. No plan row is seeded. The create function
resolves the PayPal plan ID from the server-side catalogue, authenticates the
reader, uses an environment-scoped idempotency record and creates the provider
subscription. Browser approval does not grant access.

The verify function and webhook independently fetch the authoritative PayPal
subscription and require the expected subscription ID, local custom ID, plan ID
and `ACTIVE` state before recording active billing. Suspension, cancellation,
expiry and payment failure remove subscription-derived access by changing the
authoritative subscription state. Existing profile and one-time purchase
entitlement paths remain available and are not overwritten.

The webhook remains gateway-JWT-exempt only because PayPal transmission
signature verification occurs before the environment-scoped idempotency ledger
or state mutation. Raw webhook bodies, secrets, buyer email and payment methods
are not stored.

## Changed scope

- Sandbox checkout configuration and preview isolation.
- Shared PayPal environment/project/API validation.
- Environment-scoped one-time order RPC calls and webhook ledger operations.
- PayPal subscription create, authoritative verification and webhook handling.
- An unreferenced, disabled-by-default browser subscription adapter for a later
  owner-approved checkout surface.
- Environment-aware reader summary and reduced dashboard plan state.
- Append-only M39 migration and pre-activation rollback.
- Focused M37 compatibility, M38 dashboard and M39 isolation tests.

The approved dashboard markup, CSS, navigation and reader authentication files
were not redesigned.

## Production configuration still required

The following are deployment inputs, not repository values:

```text
SUPABASE_URL=https://qlnvhfapctcpzqyuhhth.supabase.co
GPIR_SUPABASE_PUBLISHABLE_KEY=<production browser-safe publishable key>
GPIR_SUPABASE_SECRET_KEY=<production Edge secret>
GPIR_ALLOWED_ORIGINS=https://fintechoisis.com
GPIR_PAYMENT_ENVIRONMENT=production
GPIR_PAYPAL_ALLOWED_ORIGINS=https://fintechoisis.com
PAYPAL_ENVIRONMENT=production
GPIR_PAYPAL_PRODUCTION_ENABLED=true     # final owner-controlled activation only
PAYPAL_CLIENT_ID=<live public client id>
PAYPAL_CLIENT_SECRET=<live Edge secret>
PAYPAL_WEBHOOK_ID=<live webhook id>
```

Production also requires an owner-approved PayPal product/plan, one inactive
production plan row, any approved one-time offers, and an exact-origin public
checkout configuration. Nothing in this release candidate creates or activates
those resources.

## Deployment sequence

1. Review this branch and verify that production remains disabled.
2. Back up the target schema and confirm the production project reference.
3. Apply `20261015000000_m39_paypal_environment_boundary.sql`; do not seed an
   active offer or plan.
4. Configure `GPIR_PAYMENT_ENVIRONMENT=production` and deploy
   `gpir-reader-summary` with JWT verification enabled.
5. Verify authenticated and unauthenticated My GPIR responses, then publish the
   existing dashboard route if separately approved. Billing remains inactive.
6. Deploy create/capture/create-subscription/verify-subscription functions with
   JWT verification enabled, while leaving
   `GPIR_PAYPAL_PRODUCTION_ENABLED` absent or false.
7. Deploy the webhook with gateway JWT verification disabled, configure the
   environment-specific secret, and register the production URL with PayPal.
8. Reconcile the webhook ID and subscribe to capture plus subscription
   activated, suspended, cancelled, expired and payment-failed events.
9. Insert owner-approved production offer/plan rows as `DRAFT`; verify all
   project, environment, amount, currency and provider identifiers.
10. In a separate owner-authorized activation, set the chosen row to
    `LIVE_ACTIVE`, set `GPIR_PAYPAL_PRODUCTION_ENABLED=true`, deploy an approved
    public checkout configuration and perform controlled live verification.

Steps 7–10 are not authorized or executed by this milestone.

## Rollback

Before any production payment state exists, disable the functions and apply
`20261015000000_m39_paypal_environment_boundary.rollback.sql`. The rollback
refuses to run if a production offer/order or any subscription record exists.

After activation, rollback is operational and non-destructive: disable new
order/subscription creation, mark offers/plans inactive, retain capture and
webhook reconciliation for in-flight payments and refunds, preserve all audit
and entitlement rows, and remove credentials only after webhook retirement.
Live payment history must never be dropped or rewritten.

## Validation

Post-implementation validation on 2026-10-15:

- changed JavaScript/module syntax checks: PASS;
- `git diff --check`: PASS;
- M37 PayPal compatibility: 10/10 PASS;
- M38 My GPIR dashboard: 14/14 PASS;
- final M39 environment/subscription boundary: 7/7 PASS;
- combined M34–M39 invocation: 289/296 PASS. The seven failures are confined
  to pre-existing M35/M36 generated-artifact assumptions: one expected empty
  placeholder count and six missing or hardcoded-path M36 artifacts, including
  references to `C:\Development\GPIR\krishnan-vishal.github.io`. No M37–M39
  test failed;
- the four repository-wide validator commands named by current governance are
  absent from this branch, so Node returned `MODULE_NOT_FOUND`; they could not
  be executed without importing unrelated later-branch tooling.

## Release blockers

- The M39 migration has not been applied to production.
- Production Edge Functions and reader summary have not been deployed.
- No live PayPal product, plan, credentials or webhook has been configured or
  reconciled.
- No production offer or subscription plan has owner-approved commercial terms.
- Production payment collection remains deliberately disabled.
- Final owner approval is required for every production deployment and
  activation step.

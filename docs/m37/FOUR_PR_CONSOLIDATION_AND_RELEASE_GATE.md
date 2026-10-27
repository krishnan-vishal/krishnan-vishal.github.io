# M37 — Four-PR consolidation and release gate
Date: 2026-10-27
Status: controlled integration; no authorization to blindly merge four branches.

## Reviewed open PRs
- #466 `feature/m37-subscription-return-contract` → `main`: recurring subscription reconciliation and refund/reversal evidence. Independent recurring billing scope. Review and selectively port only if required, with isolated regression tests.
- #467 `codex/m37-payonce-checkout` → `feature/m37-subscription-return-contract`: earlier Sandbox pay-once UI. **Not** based on main. Superseded as Production source by the validated six-currency implementation; do not merge into main.
- #468 `feature/onetime-multicurrency-sandbox` → `main`: broad Sandbox implementation, includes JPY and Sandbox-only environment constraints. Use as reference and selectively port, never merge whole branch.
- #469 `release/m37-six-currency-disabled-prep` → `main`: single controlled Production integration PR, six currencies only, disabled checkout.

## Production database state
A separate additive migration `m37_six_currency_disabled_catalog` was applied and verified on Production project `qlnvhfapctcpzqyuhhth`. It registers USD/EUR/GBP/SGD/AUD/CAD at 999 minor units for recurring and one-time; USD existing recurring plan linked; other recurring plans pending actual PayPal IDs; all one-time checkout options disabled. No one-time orders/entitlements/webhook schema deployed yet.

## Sequenced release gates
1. Review actual Production schema and current `resolve_publication_entitlement` definition. Reconcile contradictory Sandbox migrations into one forward-only Production schema and RPC package; do not replace existing recurring authorization branches.
2. Implement one-time order, capture, webhook, 30-day entitlement, refund/reversal and idempotency; ensure RLS and server-only mutation. Keep payment activation disabled.
3. Implement reader checkout and dashboard, with PayPal-account-independent GPIR login and PayPal-governed guest funding eligibility.
4. Verify test suite, repository security workflow, database RPC permissions, disabled behavior, no recurring subscription regression, and controlled deployed readbacks.
5. Only then merge #469 and deploy disabled functions/schema; activate separately when live provider configuration and operational checks pass.

## Explicit prohibitions
- Do not merge #466/#467/#468 en masse.
- Do not create fabricated live PayPal billing plan IDs.
- Do not migrate Sandbox payment records or reader identities.
- Do not enable checkout or initiate owner-funded live payment.
- Do not report mock tests as proof of live provider acceptance.
- Do not remove existing monthly subscription routes, PayPal webhooks or access classes.

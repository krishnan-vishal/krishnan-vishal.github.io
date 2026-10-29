# M37 restricted USD 1 production checkout — implementation gate

Status: DRAFT / NOT DEPLOYABLE. This document is a scoped implementation specification, not payment code.

## Verified current live architecture
- Create: `gpir-onetime-create-order` (Production v9).
- Capture: `gpir-onetime-capture-order` (Production v7).
- Offers: `public.gpir_m37_list_offers()` reads `public.gpir_m37_currency_catalog`.
- Order preparation: `public.gpir_m37_prepare_order(p_user_id,p_currency,p_client_request_id)`.
- Order storage: `public.gpir_m37_onetime_orders`.
- Shared normalization: `supabase/functions/_shared/gpir-onetime-production.mjs`; `ONETIME_AMOUNT_MINOR=999` in `gpir-onetime-currency.mjs`.

## Required design before implementation
1. Resolve designated test reader's Supabase auth UUID server-side, not from browser-supplied email. Never grant access based solely on user metadata.
2. Add a server-side restricted test selector (not a browser-controlled price). Require USD and verified test reader UUID; reject all other readers/currencies.
3. Keep normal public offer catalogue and 999-minor-unit validation unchanged. Do not advertise USD 1 to other readers.
4. Prepare and persist a 100-minor-unit test order only after server-side eligibility checks. Preserve request idempotency and immutable order amount.
5. Extend order normalization narrowly for the explicitly flagged restricted test order, never for arbitrary amounts.
6. Preserve PayPal capture amount/currency verification against persisted order, webhook validation, and 30-day entitlement issuance only after verified capture.
7. Preserve recurring subscriptions and six public currency offers. Do not change existing orders.
8. Add negative tests: unauthorized reader, missing flag, non-USD currency, mismatched capture, replayed request ID, and no entitlement before capture.
9. Deploy only after owner approval; run exactly one real USD 1 transaction; verify CAPTURED, PayPal capture ID, 30-day entitlement and protected publication access; then disable test selector.

## Release gates
- PR code + tests required before merge.
- No database mutation, Edge Function deployment, or payment as part of this draft PR.
- The test checkout does not establish a recurring subscription.

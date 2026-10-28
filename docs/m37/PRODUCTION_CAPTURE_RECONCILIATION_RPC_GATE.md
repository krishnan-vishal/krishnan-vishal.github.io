# M37 — Production capture reconciliation RPC gate

Applied to Production Supabase project `qlnvhfapctcpzqyuhhth` as migration `m37_verified_capture_reconciliation_and_access_rpc`.

## Installed functions

1. `public.gpir_m37_finalize_verified_capture(uuid,text,text,text,integer)`: service-role-only, SECURITY INVOKER; validates order/currency/amount/provider references, rejects denied/reversed orders and duplicate captures, records CAPTURED and creates one 30-day entitlement; repeat identical finalization returns original expiry.
2. `public.gpir_m37_revoke_verified_capture(text,text)`: service-role-only, SECURITY INVOKER; marks captured payment REFUNDED or REVERSED and revokes corresponding entitlement.
3. `public.gpir_m37_has_library_access()`: authenticated-only (plus service_role), SECURITY DEFINER, checks auth.uid against captured order and active, unexpired entitlement.

## Production readback

- `gpir_m37_finalize_verified_capture`: anon EXECUTE false, authenticated EXECUTE false, service_role EXECUTE true.
- `gpir_m37_revoke_verified_capture`: anon false, authenticated false, service_role true.
- `gpir_m37_has_library_access`: anon false, authenticated true, service_role true.
- No payment or entitlement data was inserted by this gate.

## Integration completion — 2026-10-28

The former integration hold is resolved in PR #469. The one-time create, capture and webhook handlers now use the Production `gpir_m37_*` preparation, attachment, reader-order, finalization and revocation contracts. Amount, currency, order identity, capture identity and `COMPLETED` state are independently verified from PayPal before finalization. Focused tests cover duplicate, delayed, pending, denied, cancelled, mismatched, unverified, refund and reversal paths. The publication resolver now calls `gpir_m37_has_library_access()` additively. Checkout and all six Production offers remain disabled pending owner acceptance.

## Operational caution

The capture RPC is a privileged reconciliation primitive, not proof of PayPal capture by itself. Only trusted, verified provider processing may call it. The refund RPC currently revokes the associated pass on verified refund/reversal; partial refund policy needs explicit server-side classification before calling it.

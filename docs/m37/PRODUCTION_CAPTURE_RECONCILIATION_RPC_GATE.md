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

## Mandatory integration hold

The staged one-time Edge Functions currently reference earlier Sandbox `gpir_*` RPC contracts. They must be adapted to the Production `gpir_m37_*` contracts, and provider order/capture amount/currency must be verified server-side **before** finalization. The current publication entitlement resolver is unchanged: it does not yet call `gpir_m37_has_library_access()`. Do not activate checkout or merge PR #469 until that integration and negative tests are complete.

## Operational caution

The capture RPC is a privileged reconciliation primitive, not proof of PayPal capture by itself. Only trusted, verified provider processing may call it. The refund RPC currently revokes the associated pass on verified refund/reversal; partial refund policy needs explicit server-side classification before calling it.

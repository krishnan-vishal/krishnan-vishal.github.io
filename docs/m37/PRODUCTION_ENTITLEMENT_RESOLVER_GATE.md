# M37 — Production entitlement resolver integration (applied)

Migration `m37_extend_publication_resolver_library_pass` was applied to Production project `qlnvhfapctcpzqyuhhth` on 2026-10-27.

The migration obtained the live definition of `public.resolve_publication_entitlement(text,text)`, checked its expected premium-plan branch, and inserted exactly one additional disjunct:

```sql
OR public.gpir_m37_has_library_access()
```

inside the existing `ENTITLED` decision branch. It did **not** remove or rewrite the existing recurring subscription, publication-purchase, access-profile, public or authenticated decisions. Resolver execution is granted to authenticated and service_role, not PUBLIC.

## Production readback
- `pass_integrated=true`
- `recurring_preserved=true`
- `purchases_preserved=true`

This is a static definition/readback check, **not** a live purchase test. Existing pass tables remain empty, and checkout remains disabled.

## Edge Function integration hold
The release branch's create/capture/webhook handlers still use Sandbox-derived RPC names. They must be adapted to the newly deployed `gpir_m37_*` schema and server-side provider verification, then run negative/idempotency tests before deployment. Do not activate payment or merge PR #469 until complete.

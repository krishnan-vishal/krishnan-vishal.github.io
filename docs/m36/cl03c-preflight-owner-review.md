# CL-03C controlled preflight — owner review required

Branch-only change. Do not run production sync yet.

1. Confirm the effective JWT role of `GPIR_SUPABASE_SECRET_KEY` without printing its value. The candidate migration grants only `service_role`; stop if that is not the verified role.
2. Review `supabase/migrations/20261020000000_m36_cl03c_supabase_authorization.sql`. Its read-only SECURITY DEFINER RPC accepts only the five approved manifest UUIDs, returns only id, gpir_publication_id, identity_status and collision_state, fixes `search_path`, uses no dynamic SQL, denies public/anon/authenticated and grants EXECUTE only to `service_role`. It does not reuse the mutating `gpir_identity_resolve`.
3. The migration's `gpir_cl03c_policy_write_preflight()` is SECURITY INVOKER and returns true only when the effective caller has SELECT, INSERT and UPDATE on the policy table. It grants only those table privileges to `service_role`. Review RLS and actual upsert eligibility separately; privilege checks alone do not prove a successful upsert.
4. Owner review and explicit approval are required before applying the migration to production. Never disable RLS or grant direct identity-table access.
5. Run local-check, then one controlled synchronization after preflight passes. Confirm exactly five Contentful draft readbacks, policy upserts/readbacks, unchanged publishedVersion, and zero publish/unpublish actions.
6. Owner-controlled publish only after synchronization report PASS. No auto-publish in this branch.

**Safety:** The synchronization script calls the identity readback and policy privilege preflight before any Contentful draft PUT and fails closed if either is absent/denied. The candidate SQL migration is not applied by this branch. No live content or payment changes.

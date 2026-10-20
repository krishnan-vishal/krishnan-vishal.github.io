# CL-03C controlled preflight — owner review required

Branch-only change. Do not run production sync yet.

1. Confirm the effective role of GPIR_SUPABASE_SECRET_KEY without printing its value.
2. Have the database owner implement a narrowly scoped read-only SECURITY DEFINER RPC `gpir_cl03c_identity_readback(p_ids uuid[])`: exactly five unique UUIDs from the approved CL-03C manifest, return only id, gpir_publication_id, identity_status, collision_state; fixed search_path; no dynamic SQL; deny public/anon/authenticated; EXECUTE only for verified workflow role. Do not reuse the mutating `gpir_identity_resolve`.
3. Implement `gpir_cl03c_policy_write_preflight()` as SECURITY INVOKER, returning true only if the effective caller has SELECT, INSERT and UPDATE privileges on the policy table. Review RLS and actual upsert eligibility separately; privilege checks alone do not prove a successful upsert.
4. Review and apply narrowly scoped policy privileges, if necessary, only with explicit owner approval; never disable RLS or broaden identity-table grants.
5. Run local-check, then one controlled synchronization after preflight passes. Confirm exactly five Contentful draft readbacks, policy upserts/readbacks, unchanged publishedVersion, and zero publish/unpublish actions.
6. Owner-controlled publish only after synchronization report PASS. No auto-publish in this branch.

**Safety:** The synchronization script now calls two RPCs before any Contentful draft PUT and fails closed if absent/denied. The SQL definitions and database grants are not deployed by this branch. No live content or payment changes.

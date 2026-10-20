# CL-03C controlled preflight — owner review required

**Historical gate record:** The instructions below capture the original
pre-migration review state. The owner subsequently authorized and completed the
migration, post-migration checks, and synchronization; the current publication
gate is recorded in the appended release section.

Branch-only change. Do not run production sync yet.

1. Confirm the effective JWT role of `GPIR_SUPABASE_SECRET_KEY` without printing its value. The candidate migration grants only `service_role`; stop if that is not the verified role.
2. Review `supabase/migrations/20261020000000_m36_cl03c_supabase_authorization.sql`. Its read-only SECURITY DEFINER RPC accepts only the five approved manifest UUIDs, returns only id, gpir_publication_id, identity_status and collision_state, fixes `search_path`, uses no dynamic SQL, denies public/anon/authenticated and grants EXECUTE only to `service_role`. It does not reuse the mutating `gpir_identity_resolve`.
3. The migration's `gpir_cl03c_policy_write_preflight()` is SECURITY INVOKER and returns true only when the effective caller has SELECT, INSERT and UPDATE on the policy table. It grants only those table privileges to `service_role`. Review RLS and actual upsert eligibility separately; privilege checks alone do not prove a successful upsert.
4. Owner review and explicit approval are required before applying the migration to production. Never disable RLS or grant direct identity-table access.
5. Run local-check, then one controlled synchronization after preflight passes. Confirm exactly five Contentful draft readbacks, policy upserts/readbacks, unchanged publishedVersion, and zero publish/unpublish actions.
6. Owner-controlled publish only after synchronization report PASS. No auto-publish in this branch.

**Safety:** The synchronization script calls the identity readback and policy privilege preflight before any Contentful draft PUT and fails closed if either is absent/denied. The candidate SQL migration is not applied by this branch. No live content or payment changes.

## Owner-authorized five-entry publication capability

The owner has since authorized publishing the five synchronized draft revisions
from run `39423907702`. The existing M36 workflow now has a separate manual
`publish` operation and requires the exact confirmation
`M36-CL-03C-PUBLISH`; this path does not load Supabase credentials or run sync
or policy operations.

The release manifest pins the production Contentful space/environment and the
five entry IDs, publication IDs, canonical routes, editorial-body checksums,
draft version `3`, and preserved published version `1` from the successful
synchronization report. It rejects a sixth entry and the two unrelated CL-04
targets. All five entries must pass identity, route, body, uniqueness, and
version checks before the first publish. Each publish uses the expected entry
version and is immediately read back; any mismatch stops subsequent writes and
records the actual partial state without rollback.

At the implementation checkpoint, focused tests and local payload preparation
passed, while production publication and deployment were still pending. The
subsequent authorized publication execution is recorded below; merge through
PR #457 remains the existing GitHub Pages release trigger.

## Authorized publication execution

Workflow run
[`39427438834`](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/39427438834)
ran the `publish` operation at code commit
`12c43df4aad45e6c84dd4611f07bf5ddfda66483`. Its exact-five preflight passed;
all five version-3 draft revisions published and read back with the approved
editorial-body checksums and canonical routes. Each now has published version
`3` and entry version `4`; prior published version `1` was the preflight
baseline. The sync job was skipped, no Supabase operation ran, and the release
report records zero blockers. The Pages deployment remains pending PR merge
and its resulting production verification.

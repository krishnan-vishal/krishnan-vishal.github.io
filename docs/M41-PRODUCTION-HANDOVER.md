# M41 — controlled production cutover handover

**Source implementation is prepared in PR #580. Live cutover is not yet verified.**
Use PR #580 only. No new PR, password conversion, schema change, validation
relaxation, Contentful deletion, reset, or stash clearing is authorized by this run.

## One private execution block

Run in the existing authenticated Codespace terminal. This creates a separate
worktree and leaves the existing release checkout, its uncommitted work and all
saved stashes intact. Existing private env/CA paths are used without printing or
committing their contents.

```bash
git -C /workspaces/m41-pr580-release fetch origin fix/m41-cloudflare-sharp-admin-runtime-20261115
gpir_release_dir=$(mktemp -d /workspaces/m41-full-cutover-XXXXXX)
git -C /workspaces/m41-pr580-release worktree add --detach "$gpir_release_dir" FETCH_HEAD
cd "$gpir_release_dir"
node scripts/m41/execute-cutover.mjs --execute
```

Before production changes, the runner checks required setting names, the existing
Payload API-key role, Contentful read access, GitHub environments, Cloudflare
identity, actual Supabase function JWT policies, clean checkout and exact-head CI.
Missing settings are reported together; values are redacted. Existing Git, gh and
Supabase CLI sessions and Node >=24.22.1 are required. The existing scoped
Cloudflare API token/account settings must be available privately. No credentials
are created, roles broadened, or credentials requested in chat. Without `--execute`
the command only checks readiness and installs the pinned dependencies.

## Implemented release sequence

1. Deploy the changed CMS endpoints with the existing guarded Worker release,
   preserving Hyperdrive verify-full, CA, accounts and passwords.
2. Export Contentful read-only. Exclude only this tool's own recovery objects from
   that source export to avoid recursive backups; retain every managed source type.
3. Import all allowlisted website content and source editorial states without
   promoting draft/WARN records or replacing Supabase identities/release decisions.
4. Prepare an immutable edition from reviewed native research and fresh Supabase
   decisions. Preserve existing routes, page shell, navigation, scripts and media.
5. Sync additive Contentful recovery objects, read them back and independently
   reconstruct all managed files in a new private directory before switching.
6. Configure the existing GitHub environments and deploy only the existing
   `gpir-intelligence-publish` and `gpir-protected-publication` consumers with their
   actual existing JWT policies and original Supabase checks intact.
7. Commit the non-secret source lock to PR #580's branch; await current-head CI;
   make the existing PR ready and merge through GitHub's normal API. No bypass,
   forced push, additional PR or branch deletion occurs. Owner authorized cutover.
8. Build from Payload, deploy the existing website Worker and verify live bytes
   against the selected complete Payload inventory, plus anonymous access denial.
9. Save commits, deployment versions, coverage, recovery snapshot and live evidence
   in `.migration-data/m41-cutover/consolidated-report.json` and PR #580's body.

Existing Contentful publications, assets, models and history remain intact. New
unpublished recovery objects are additive; this is not Contentful retirement.

## Editing and durable source selection

Research Publications is the sole research editing authority. Migrated research
mirrors are read-only preservation copies. Native review takes over the same
identity; unpublishing cannot resurrect a superseded migrated edition. Imported
drafts are never bulk labelled PASS. The existing delivered edition is retained
until legitimate native review.

`prepare-site-release.ts` produces subsequent immutable site editions from approved
native content and fresh Supabase decisions. Only the existing identity-bound
content slot and its FX/route metadata change. Protected reading continues through
Supabase session/entitlement verification before Payload is contacted.

The committed `gpir-content-source.json` prevents silent fallback to repository or
Contentful primary. Builds missing private Payload settings fail closed and retain
the last good site. The existing GitHub release workflow uses configured settings.
Any separate Cloudflare Git-build trigger needs the same private build settings;
the runner does not claim to reconfigure Cloudflare's Git integration.

## Acceptance and recovery

Success status `LIVE_STATIC_CUTOVER_AND_BCP_VERIFIED` requires actual public byte
verification and actual Contentful read-back/reconstruction. It does not assert a
real authenticated reader session was exercised. Final live reader/dashboard/
protected-content observation is still required before marking overall M41 complete.

Failure status `BLOCKED_NOT_COMPLETE` records the exact stage and completed stages.
If failure occurs after merge/deployment, preserve the report and isolated checkout
and resume that recorded stage; do not blindly rerun the initial import.

`recover-site.cjs` reconstructs content and private recovery records into a new
directory. `restore-bcp.ts` restores reference/media records, the published native
edition and pending draft, and metadata. Conflicting target records are rejected.
Neither recovery command publishes a website or changes entitlements.

# M41 — private primary cutover handover

**Resume from the prepared PR #580 source. Production cutover is not yet verified.**
Latest owner direction: Payload primary now; Contentful entirely unchanged and
retained as the existing BCP baseline. No Contentful writes, new recovery objects,
model changes, synchronization gate, deletion or retirement during this release.

## Exact execution blocker in the agent workspace

The following do not exist here:

- `/workspaces/m41-pr580-release`
- `/workspaces/m41-payload/apps/gpir-cms/.env`
- `/workspaces/m41-payload/apps/gpir-cms/prod-ca-2021.crt`

`gh auth status` and `wrangler whoami` both report unauthenticated. This process has
no Payload, Contentful, Supabase, Cloudflare or GitHub private settings. The release
runner was attempted and stopped at preflight with `stages: []`; no production
change was performed. Connected GitHub access can update PR #580 but cannot execute
commands in the owner's Codespace. Never send credentials through chat.

## One complete command batch

Run once in the existing authenticated Codespace terminal. This selects and
fast-forwards the clean worktree from the reported preflight failure. It does not
create another checkout or repeat an import; production stages have not started.
Existing release checkout, uncommitted changes and all stashes are preserved. Existing private env/CA paths are read locally;
their contents are neither printed nor committed.

```bash
bash <<'GPIR_M41'
set -euo pipefail
gpir_release_repo=/workspaces/m41-pr580-release
git -C "$gpir_release_repo" fetch origin fix/m41-cloudflare-sharp-admin-runtime-20261115
git -C "$gpir_release_repo" show FETCH_HEAD:scripts/m41/resume-preflight.mjs | node --input-type=module - "$gpir_release_repo"
GPIR_M41
```

The runner checks all required settings together, the existing API-key role,
Contentful read access, GitHub environments, Cloudflare identity, actual existing
Supabase JWT policies, a clean checkout and exact-head CI before production changes.
Existing Git/gh and Supabase authentication, Node >=24.22.1 and the existing
Cloudflare login must be available privately. The runner reuses Wrangler login
and discovers the account using the existing verified Hyperdrive binding. A
separate CLOUDFLARE_API_TOKEN or explicit account ID is not required for this
private release. An existing Contentful Delivery key is recovered using read-only
management requests when not already configured. No key is created or printed. If Supabase CLI is
not installed globally, the runner uses the same pinned 2.121.0 CLI as the existing
repository deployment workflow through npx; no application dependency is changed. It does not create
credentials, broaden roles, convert passwords, alter schemas or weaken TLS.

## Implemented controlled release

1. Pause/cancel only the existing editorial draft writer during the switch so the
   old Contentful writer cannot compete. Global Alerts ingestion/publication cron,
   thresholds and expiry/archival rules are unchanged.
2. Deploy changed CMS endpoints using the existing guarded Worker release, preserving
   Hyperdrive verify-full, trusted CA, accounts and passwords.
3. Export Contentful using read requests only; use that source input to import all
   allowlisted content and editorial states. Existing Contentful content stays intact.
4. Prepare immutable Payload editions from reviewed native research and fresh
   Supabase decisions. Draft/WARN records are never bulk promoted.
5. Record the existing Contentful export, original Payload snapshot and previous
   repository commit as the recovery baseline. **Do not synchronize or write BCP.**
6. Configure existing GitHub environments for Payload primary. Deploy only the
   existing `gpir-intelligence-publish` and `gpir-protected-publication` consumers
   with their actual existing JWT policies and original Supabase checks retained.
7. Commit the non-secret primary-source lock to PR #580 only; wait for current-head
   CI; make that PR ready and merge using GitHub's normal API without a bypass.
   Re-enable the draft workflow only if it was originally active, now with Payload
   selected and Contentful writes blocked. No new PR or branch deletion occurs.
8. Build all managed bytes from Payload, deploy the existing website Worker and
   verify actual live bytes against the complete selected Payload inventory.
9. Record deployment versions, commits, coverage, recovery baseline and anonymous
   protected-access denial in `.migration-data/m41-cutover/consolidated-report.json`
   and PR #580's body.

## Evidence and limitations

Success status is `LIVE_STATIC_CUTOVER_VERIFIED_CONTENTFUL_UNCHANGED`. It requires
actual public byte verification, not just tests, login, imported counts or a runner.
It does not claim an authenticated reader session unless the existing private
`GPIR_ACCEPTANCE_READER_TOKEN` is available and its real protected read returns
ALLOW with the `x-gpir-editorial-source: payload` response header. A privately
configured authorized publication ID/record ID may select that test record; no
credentials should be sent through chat. Without that existing session, the report
explicitly leaves the protected-reader observation outstanding. Final live reader
and dashboard acceptance remains necessary for full completion.

`BLOCKED_NOT_COMPLETE` records the exact failed stage and completed stages. Preserve
that report and the isolated checkout. If failure is after merge/deployment, resume
the recorded stage rather than blindly repeating the initial import.

The source lock prevents a future build from silently reverting to repository or
Contentful primary. Missing private build settings fail closed. GitHub's existing
Payload release workflow uses configured settings; any independent Cloudflare
Git-build trigger also needs those settings. This runner does not reconfigure that
separate Git integration.

## Recovery path

Contentful retains its original pre-cutover state and assets, without modification.
The private read-only export and original immutable Payload site snapshot preserve
the migration baseline. Existing Git/Cloudflare deployment history remains intact.
A controlled rollback can restore the previous website release and select
`GPIR_EDITORIAL_SOURCE=contentful` for the existing protected/publication readers;
their Contentful read adapters and original secrets are retained.

Future Payload edits are **not** synchronized to Contentful in this release. BCP
synchronization tools remain separately available but reject writes by default and
must not be enabled without separate owner authorization. Their execution is not a
cutover prerequisite. This is the explicit recovery freshness limitation of leaving
Contentful entirely unchanged.

## Reported preflight correction

The owner executed checkpoint 1c353a2 and the runner stopped with stages=[] because
CONTENTFUL_DELIVERY_TOKEN, CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID were not
explicitly set. Those three settings are no longer mandatory. The runner uses
existing Wrangler authentication (without extracting/exporting OAuth credentials),
verifies the account against the known CMS binding, and reads an existing Delivery
key with the management token. All credential values remain in private process
memory and are registered for error redaction. API-key lookup uses GET only.

An interactive Wrangler session is not copied into GitHub secrets. Existing GitHub
Cloudflare secrets are left intact if no explicit API token is supplied; future
headless deployments still need an appropriate pre-existing CI credential. This
does not block the authorized private-session cutover.

Vendor references: [Wrangler authentication](https://developers.cloudflare.com/workers/wrangler/commands/general/),
[read existing Delivery API keys](https://www.contentful.com/developers/docs/references/content-management-api/api-keys/get-all-delivery-api-keys/).

## Supabase project-boundary correction

The owner resumed at 1e41d42 and stopped with stages=[] on the former hard-coded
project check. That guard conflated the private CMS database project with GPIR
Core. The corrected runner validates the CMS URL against its database URI and
existing Hyperdrive origin/CA, while deriving the unchanged Core API/function
project from the committed browser configuration. It does not redirect Core to
the CMS project, overwrite the private CMS URL or move identities/entitlements.

Core release credentials are selected only from existing private settings and
verified using a read-only Core request. They remain separate from CMS connection
credentials, are deployed only as server secrets and are removed from build-time
settings. Missing or wrong-project authority still blocks safely; no key is made.

The resume helper now accepts any clean ancestor checkpoint of this PR that has
not reached a production stage. It does not depend on the old 1c353a2 commit and
will resume the reported 1e41d42 worktree. Dirty worktrees or recorded production
stages are never reset or blindly re-imported. The repository's pinned Supabase
CLI v2.121.0 is retained instead of using incompatible global v3 flags.

Core release authority reuses an existing private key first. If none authenticates Core, the already-authenticated pinned Supabase CLI may read existing Core API keys (`projects api-keys --reveal --output json`); captured output is withheld, all returned keys are redacted, and the selected service key must pass a read-only Core request. No API key is created or rotated. An explicit Core key is never silently substituted.


## M41 — missing GitHub cutover environment corrected (2026-11-15)

Owner's 038b16e attempt passed CMS/Core separation, then stopped at preflight with
HTTP 404, stages=[] and zero Contentful writes. Read-only repository environment
inventory confirms contentful-production and payload-preview exist, while
payload-production-cutover is absent. Runner now inventories environments instead
of GET-probing a not-yet-created environment; missing cutover setup requires the
existing gh identity to have repository administration permission. After all
preflight/CI gates and --execute, it provisions only the missing cutover environment,
rechecking existence first. Existing environments and protections receive no PUT.
22 access/resume/environment tests and unchanged secret scan pass. Existing safe
preflight worktree resumes with the same complete batch. PR #580 only; no production
migration/deployment/live acceptance claimed; Contentful unchanged. M41 stays OPEN.


## M41 — Contentful access passed; private Supabase management lookup blocked

Owner execution at 81709cb successfully reused the existing Contentful Delivery
key read-only, then stopped at Core key lookup (stages=[], no production or
Contentful writes). Prior error handling concealed the failure category. Runner
now reports only fixed, credential-free authentication/permission/compatibility/
network categories, never raw key command output. If an environment PAT is rejected,
it may reuse an existing stored CLI login; subsequent deployment keeps that same
management session. Pinned CLI 2.121.0 key and interactive login flags were checked.
23 focused tests and unchanged secret scan pass locally. The private continuation
can refresh management login with `env -u CI -u SUPABASE_ACCESS_TOKEN npx --yes
supabase@2.121.0 login --no-browser </dev/tty`, then run the existing resume batch.
No project keys created/rotated, schema changes or weakened source/entitlement
checks. PR #580 only. M41 remains OPEN pending actual private migration/live cutover.


## M41 — GitHub integration permission blocker; safe setup-only resume

Owner's 8d89b9b run passed Contentful, existing Core key lookup and both source CI
checks. First execution stage, creation of payload-production-cutover, received
HTTP 403 Resource not accessible by integration. No CMS deployment, draft writer
pause, migration or Contentful write occurred. Repository admin metadata did not
prove that the Codespaces integration credential held Administration write access.
Use the owner's interactive GitHub browser login (`gh auth login --hostname
github.com --web --git-protocol https --scopes repo,workflow </dev/tty`) with
GH_TOKEN/GITHUB_TOKEN unset, then privately select that stored login as GH_TOKEN
for the existing resume command. Do not print credentials or change private env.
Resume now accepts this exact setup-only failure with no later deployment/content
or draft-writer evidence; it still rejects partially executed production releases.
24 focused access/resume tests, syntax and unchanged secret scan pass locally.
PR #580 only. Existing environment protections and Contentful remain unchanged;
actual migration/live cutover pending. M41 remains OPEN.


## 2026-11-16 — M41 deployed-CMS checkpoint reconciled; guarded continuation

Owner supplied the private release evidence for source
`8c0637635dabab89d0d7ad0c924adf9ffa3bff0a`, CMS deployment version
`92fab47e-ee45-4b81-bbe8-b69e720b3d80`. Status is
`DEPLOYED_PUBLIC_SMOKE_VERIFIED`; admin HTTP 200 and anonymous user null.
This supersedes the older saved 13:23 UTC environment-provisioning failure for
the CMS deployment stage only. Editorial live login remains pending; no completed
content import, source switch or public/protected delivery is claimed.

The existing release worktree is `/workspaces/m41-full-cutover-suddBZ`.
Owner's read-only inspection found only two tracked build-generated modifications:
`apps/gpir-cms/next-env.d.ts` and `apps/gpir-cms/tsconfig.json`.
They are preserved. The Codespace has 2.5 GB free on a 32 GB volume; this is
development storage, not production hosting capacity.

PR #580 alone gains an explicit post-CMS continuation. It verifies the saved
evidence, unchanged deployed CMS runtime source and the sole active Cloudflare
version using a read-only deployment-status query. It accepts only the exact
observed Next-generated semantic changes, preserves the previous report/generated
patch privately, and skips npm ci, CMS build and CMS redeployment. It refuses
later/partial import evidence and checks at least 1 GiB available before import.
Preflight failure is saved separately so the old report survives. Entered release
stages are now persisted before their commands, distinguishing an interrupted
stage from completed evidence.

The continuation explicitly authorizes restoring the existing draft writer after
the normal merge, with Payload primary and Contentful writes blocked. Existing
environments/protections, all stashes/worktrees, URLs, both tickers, Smart Cards,
Supabase engines, JWT policies, validation thresholds and expiry rules are retained.
Contentful remains unchanged. No cleanup/deletion or paid infrastructure added.

Validation: 26 focused access/resume tests and both changed executable syntax
checks PASS locally. New cases reject deployment drift, split traffic, unexpected
config edits and partial import evidence. Current-head remote CI must pass before
private production continuation. Agent has connected GitHub access but no private
Codespace terminal, credentials or reader session. No private import/live acceptance
performed from this agent workspace; M41 remains OPEN.

### Current continuation command — only after the evidenced CMS deployment

This supersedes the earlier preflight-only batch for this exact checkout.
Run once in the existing authenticated Codespace terminal. This uses the owner
GitHub login rather than the Codespaces integration token, keeps credentials
private, preserves local generated changes and all stashes, and reuses the verified
CMS version. It does not create another checkout or reinstall/build/redeploy CMS.

```bash
bash <<'GPIR_M41'
set -euo pipefail
unset GH_TOKEN GITHUB_TOKEN
export GH_TOKEN="$(gh auth token --hostname github.com)"
gpir_release_repo=/workspaces/m41-full-cutover-suddBZ
git -C "$gpir_release_repo" fetch origin fix/m41-cloudflare-sharp-admin-runtime-20261115
git -C "$gpir_release_repo" show FETCH_HEAD:scripts/m41/resume-preflight.mjs | node --input-type=module - "$gpir_release_repo" --after-cms
GPIR_M41
```

Existing authenticated reader acceptance settings, if already configured privately,
are reused. Never paste reader tokens or service credentials into chat. Without a
real authorized reader session, the existing runner leaves protected delivery
acceptance outstanding even if public byte verification passes; M41 is not closed.
If the command stops, preserve the final JSON and checkpoint directory. Do not
repeat an import after later-stage evidence appears. No storage cleanup is performed.

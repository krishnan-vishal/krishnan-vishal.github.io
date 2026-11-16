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


## 2026-11-16 — read-only Core management credential selection

Owner's post-CMS continuation at `6e00295` passed repository environment inventory,
existing Wrangler/Hyperdrive account and read-only Contentful access. It stopped
at preflight on `CLI_PERMISSION` during existing Core key lookup; stages=[], zero
Contentful writes, no new deployment or import. The previous release report is
preserved; the new failure is in `resume-preflight-failure.json`.

Confirmed source defect: fallback to an already authenticated stored Supabase CLI
login handled an environment PAT's authentication refusal (401), but not its
permission refusal (403). A token scoped outside Core can return 403; this is a
possible cause, not a proven diagnosis of the private token. The corrected
credential selector tries the existing stored CLI login once for either category,
only during read-only key inventory or function listing. It never retries writes,
changes roles/scopes, creates/rotates keys, mutates the parent environment or
retries a selected session. A successful stored session is reused for later
management commands; actual Core key authority must still pass the existing
read-only Core request. A refusal of both sessions remains blocked.

28 focused tests and runner syntax PASS locally. New tests cover 401/403 selection,
parent-settings preservation, no write retry and bounded repeated refusal.
Pinned CLI 2.121.0 retained; no dependency, schema, runtime CMS source or TLS change.
Same post-CMS command and PR #580 only. CMS version 92fab47e remains the selected
checkpoint; generated files and stashes preserved. Current-head CI/private
continuation and actual public/protected live delivery remain required. M41 OPEN.


## 2026-11-16 — existing Contentful export discovered; preserve and reuse

Owner refreshed the existing Supabase CLI login. The next `c447d74` continuation
verified stored-login management access and the existing Core release key using
read-only requests. It then stopped on the partial-release guard, stages=[] and
zero Contentful writes. Owner's directory inventory explains that guard: the
saved Contentful export exists, with JSON archives at 13:34:59 UTC and the final
manifest at 13:35:01 UTC on 15 November. No coverage/research-edition/live report
was found. The old 13:23 failed report predates those later completed files.

The post-CMS continuation now distinguishes a completed read-only export from
later import/release evidence. Before accepting it, source/environment,
manifest schema, six JSON checksums, identity/count integrity, exclusion of BCP
recovery records, and all expected media paths/byte lengths/hashes are validated.
Path traversal/symlink escape and omitted expected media are rejected. The saved
export is reused in place without rewriting files or fetching another export.
The original content-addressed immutable Payload importer still reconciles
matching records and refuses conflicts/duplicate identities instead of
overwriting any native/editorial changes. Coverage/research/live evidence still
blocks ambiguous replay. No guard is simply disabled.

29 focused tests and runner syntax PASS locally; the new saved-export test covers
valid reuse with no writes, wrong source, counts, missing manifest, tampered JSON,
tampered media, omitted assets and unsafe paths. Private export integrity is not
claimed before the runner actually verifies those owner-side bytes.
Current-head CI and private execution remain required.

PR #580 only; same continuation command, no further login required by the latest
evidence. CMS version 92fab47e reused; generated files, private exports, original
reports and stashes preserved. No Contentful change or new CMS deployment.
M41 remains OPEN until migration/source switch and actual public/protected live
Payload delivery are evidenced.


## 2026-11-16 — confirmed export; already-paused writer continuation corrected

Owner's `8363807` run verified and reused CMS version 92fab47e and the saved
read-only Contentful export: 112 entries, 2 content types, 5 assets, 3 media files,
1 locale; all six JSON archives and three media hashes passed. ExportedAt:
2026-11-15T13:35:00.996Z; manifest SHA-256:
3236fd0e3581a84263c44010a980d22de95167cdc679ee3cf6ea4f41fb817f7b.
GitHub, Cloudflare and Core stored-login/key authority also passed.
No new import, CMS deployment or Contentful write occurred.

The run stopped while pausing the editorial draft workflow: GitHub 403 explicitly
said the workflow was already inactive. Confirmed runner defect: the earlier
restore-after-merge authorization was incorrectly used as the current-state
disable condition. This was an orchestration error, not a need to repeat CMS/export.

The correction separates observed workflow state from later restore intent.
An already manually disabled workflow needs no disable request. An active writer
is paused once; a concurrent pause is accepted only after the desired disabled
state is observed, while genuine failures remain errors. Original/authorized
restore intent survives continuation and controls only the post-merge enable.
A queued-run cancellation race is tolerated only if that exact run completed;
post-merge restoration leaves an already-active workflow alone. Unknown lifecycle
states still block. No workflow protection, content or subscription change.

32 focused tests and runner syntax PASS locally, including already-paused,
active-then-resume, concurrent pause, real denial and unexpected-state cases.
Required current-head CI and private execution remain pending when this entry
is authored. Same PR #580 and same guarded post-CMS continuation command.
Completed CMS/export/access evidence is retained; all files and stashes preserved.
M41 remains OPEN until migration/source switch and real public/protected live
Payload delivery are evidenced. No full-completion claim.


## 2026-11-16 — interrupted import checkpoint; detached recovery

Owner reports no release/import processes after the session timeout. The durable
consolidated report is IN_PROGRESS at the Contentful-export/public-Payload-import
stage, with pause and CMS stages entered; coverage, research-edition and live
reports are absent. This does not prove that no database records were written.
Completed CMS version 92fab47e, verified saved export (112 entries, 5 assets,
3 media files), source checks and authentication remain established.

Explicit --resume-import accepts only this known interrupted stage with the same
verified export hash, no later coverage/research/live evidence and zero Contentful
writes. It pins the original import source commit across further tooling commits.
The runner checks ancestor history and permits only the reviewed runner, standalone
importer, tests and handoff files to differ; changes to managed website inputs
remain blocked. The immutable content-addressed importer reuses identical objects
and refuses conflicts/duplicates, preserving possible partial records. It does
not create another source edition simply because recovery tooling changed.

The standalone CLI importer gains a pinned-source option, bounded Delivery fetch
and atomic progress/error-phase JSON; it closes its Payload connection in finally.
It is the sole excluded offline file in the CMS-runtime comparison: no Worker
runtime/config/dependency change or CMS redeployment is included. Required remote
TypeScript/Worker validation still applies.

The existing bootstrap supports --background. It launches the same guarded runner
detached, with private timestamped logs and saved PID/log metadata. An exclusive
release lock blocks overlapping executions and archives stale/finished lock
metadata instead of discarding it. Browser disconnect does not terminate this
detached process; stopping/suspending the Codespace still does. All original work,
stashes, source export and preceding reports remain preserved.

35 focused tests and JavaScript executable syntax checks PASS locally. The three
new tests cover source pin/export mismatch, explicit interrupted-stage limits and
overlapping/stale execution locks. Local full-app TypeScript compiler unavailable;
required remote validation/build must pass before private continuation.
No private database import, website source switch or live acceptance performed
from the agent workspace. M41 remains OPEN until actual public and protected
Payload delivery are evidenced.

### Interrupted import recovery command (supersedes foreground continuation)

Use only for the owner-evidenced IN_PROGRESS import checkpoint with no running
release process. This launches detached and follows its saved log; closing the
terminal will stop the log viewer, not the release. Keep the Codespace running.
Existing authenticated sessions are reused privately; no further login or export.

```bash
bash <<'GPIR_M41'
set -euo pipefail
unset GH_TOKEN GITHUB_TOKEN
export GH_TOKEN="$(gh auth token --hostname github.com)"
gpir_release_repo=/workspaces/m41-full-cutover-suddBZ
git -C "$gpir_release_repo" fetch origin fix/m41-cloudflare-sharp-admin-runtime-20261115
git -C "$gpir_release_repo" show FETCH_HEAD:scripts/m41/resume-preflight.mjs |
  node --input-type=module - "$gpir_release_repo" --after-cms --resume-import --background
read -r gpir_pid gpir_log < <(python3 - <<'PY'
import json
from pathlib import Path
file = Path('/workspaces/m41-full-cutover-suddBZ/.migration-data/m41-cutover/background-launch.json')
data = json.loads(file.read_text())
print(data['pid'], data['log'])
PY
)
tail --pid="$gpir_pid" -n 60 -f "$gpir_log"
GPIR_M41
```

The launch status BACKGROUND_RELEASE_STARTED_NOT_COMPLETE is not acceptance.
Read import-progress.json for phase/counts and consolidated-report.json for stage
outcomes. Preserve any failure report and partial database records; never use
delete/reset or a fresh migration as recovery. Real authorized protected-reader
acceptance remains mandatory for overall closure.


## 2026-11-16 — existing deployment-token access repair, PR #580 only

Owner requests fixing the runner's management access without repeating migration,
credential submission, reconciliation or CMS deployment. Both isolated CLI
contexts failed; missing environment/fallback files do not establish native
credential-store state. The exact native-login rejection cause is unconfirmed.

Repository evidence identifies an established deployment authority:
`.github/workflows/gpir-p2-production-functions.yml` uses the repository secret
`GPIR_SUPABASE_DEPLOY_TOKEN` for Core management. The private cutover runner
did not consume that named credential and depended on a locally retrievable CLI
login. This continuation wires the runner to an existing named deploy token or
a verified private session recovered from that existing GitHub secret.

Access-only repair is added to the existing payload-cms-ci workflow, restricted
to explicit workflow_dispatch by krishnan-vishal on the exact PR #580 branch.
Repair mode skips validation/Worker-build jobs and never runs migration or deploys
P2/payment functions. It uses GET-only Core functions and API-key permission
checks; response bodies/keys are discarded. No Supabase token/key is created,
rotated, broadened or printed. The repository credential's current validity is
not assumed: a non-200 permission check blocks and reports only safe HTTP status.

An ephemeral RSA recipient key is generated privately in the existing ignored
Codespace migration directory. Only its public key and random request ID are
workflow inputs. GitHub encrypts the existing token with AES-256-GCM plus
RSA-OAEP/SHA-256; only the authenticated encrypted envelope is retained as a
one-day artifact. The private key never leaves the Codespace. Local decryption
checks request/Core binding and one-hour handoff age, then repeats the actual
read-only management checks before saving mode-0600 private management-session
JSON. Logs/reports contain only request/run IDs, status and HTTP codes. Pending
requests reuse the same private request/key instead of duplicate dispatch.

The runner reads that ignored private session explicitly and reuses it for
management commands; it no longer needs native keyring retrieval after successful
repair. Original CMS .env, Contentful and migration database records are unchanged.
The interrupted import remains pinned; its source-change allowlist names only the
new reviewed access tooling/tests and existing CI workflow. No managed content or
runtime CMS source changed.

39 focused tests and JavaScript syntax PASS locally. Tests cover encrypted
round-trip/no plaintext, wrong request/Core, stale handoff, ciphertext tamper,
weak key rejection, safe 401/403/429 handling, read-only requests, owner-only
workflow and build skipping. Workflow YAML parses; the existing CI workflow is
present on main, supporting dispatch of the reviewed PR ref. Remote required CI
must pass before owner-side access repair. GitHub secret presence/actual authority,
encrypted handoff and private runner acceptance are NOT yet evidenced.

M41 remains OPEN. This is an executable access-only correction, not deployment or
migration completion. No Codespace run or manual workflow dispatch was performed
from this agent workspace; private terminal execution is still required.

### Access-only management repair (does not resume migration)

Run once in the existing Codespace after current-head required checks pass.
It reuses the owner GitHub login and the repository deployment credential; do not
paste credentials into chat. It performs only management access repair and outputs
MANAGEMENT_ACCESS_REPAIRED after both actual Core read checks succeed. It does not
run CMS build, Contentful export, migration, reconciliation, merge or deployment.

```bash
bash <<'GPIR_M41_ACCESS'
set -euo pipefail
unset GH_TOKEN GITHUB_TOKEN
export GH_TOKEN="$(gh auth token --hostname github.com)"
gpir_release_repo=/workspaces/m41-full-cutover-suddBZ
git -C "$gpir_release_repo" fetch origin fix/m41-cloudflare-sharp-admin-runtime-20261115
git -C "$gpir_release_repo" merge --ff-only FETCH_HEAD
node "$gpir_release_repo/scripts/m41/repair-management-access.mjs" --repair
GPIR_M41_ACCESS
```

The private session is ignored by Git and protected mode 0600. Its token value,
private recipient key and decrypted contents must never be copied into chat, Git
or reports. If the existing repository secret is unavailable or lacks authority,
the access-only job fails without creating credentials or rerunning migration.
The failed GitHub job identifies the specific missing-secret/HTTP failure.


### Access-repair follow-up checks

Normal validation runs retain the exact required `M41 Payload CMS validation`
identity; only access-repair runs include the non-secret request ID in their title.
An additional CLI test proves a missing repository credential reports its exact
access-only stage without a network call or repeated login. The combined focused
inventory is now 40 tests. Actual encrypted handoff remains pending owner-side
execution; no management-access or migration completion is claimed.


## 2026-11-16 — finish from saved operation 775 in durable bounded batches

Production observation increased from 641 to 742 distinct managed-content objects.
Owner's saved progress proves 100 created + 675 reused file operations, total 775,
of 835 managed-file operations. These are operation counts, not a unique-object
coverage percentage. No manifest/archive/editorial completion is recorded yet.

Owner's read-only process/resource check: no release/import processes; 2469 MiB
free disk; available cgroup counters oom=0, oom_kill=0, oom_group_kill=0; log ends
during import without an application failure report. The exact external
termination reason is NOT established. Do not diagnose OOM, disk exhaustion,
credential failure or successful completion from that evidence.

The standalone importer now seeds an explicit source/snapshot-bound cursor from
the verified legacy 775-operation checkpoint. It preserves the original progress
separately and skips that completed blob prefix. Any uncertain work after the last
old checkpoint is matched by immutable identity rather than duplicated. Subsequent
cursor saves happen atomically after EVERY successful database operation. A stop
between database commit and cursor save can replay only that uncertain operation.

Each child handles at most 25 operations with a 32 MiB accounted-payload threshold,
then closes its database connection. The existing parent continues short children,
logs the saved phase/position after each batch, and applies a five-minute child
timeout plus a bounded batch limit. It does not reset migration or repeat the
completed prefix. The saved public-build input is reused; no CMS rebuild or repeat
Contentful export. The published Delivery response is captured privately once and
checksummed for all remaining batches. No Contentful writes.

Plan/cursor hashes bind source commit, immutable snapshot, frozen Delivery bytes
and phase sizes. Phases remain blobs -> source archive -> source entries ->
editorial mirrors -> manifest. The existing immutable/conflict checks, verified
Delivery import context, WARN/draft preservation and manifest-last rule remain.
A complete cursor cannot skip uncompleted phases. Interrupted temporary checkpoint
files are archived before replacement. Ordinary failures record a safe category,
position and key without returning raw private diagnostics.

Only the existing offline importer/runner, one framework-independent checkpoint
helper/test and existing CI test command change. No Worker runtime, dependency,
Supabase schema/role/auth/entitlement change, threshold change, new service or new
architecture. The repaired private management session is reused. Original
worktrees, stashes, exports, saved input and persisted database records remain.

47 focused tests and changed JavaScript syntax PASS locally. New cases prove
775-prefix skipping, cursor precedence/plan mismatch rejection, manifest-last
ordering, commit-before-save interruption without duplicate writes, batch limits,
safe failure categories and preservation of interrupted temporary evidence.
Required remote full-app TypeScript/Worker/Integrity checks must pass before
private continuation. No production batch run or public/protected live cutover
performed from this agent workspace; M41 remains OPEN.

### Resume remaining batches from the saved import cursor

This supersedes a whole-import replay. Run once after current-head required checks
pass, with the existing Codespace running. It keeps the repaired session and saved
775-operation prefix. No login, access-repair job, CMS deployment, repeat export or
fresh public-build copy is requested. The background log shows each saved batch
position and continues through the existing release sequence after final coverage.

```bash
bash <<'GPIR_M41_BATCHES'
set -euo pipefail
unset GH_TOKEN GITHUB_TOKEN
export GH_TOKEN="$(gh auth token --hostname github.com)"
gpir_release_repo=/workspaces/m41-full-cutover-suddBZ
git -C "$gpir_release_repo" fetch origin fix/m41-cloudflare-sharp-admin-runtime-20261115
git -C "$gpir_release_repo" show FETCH_HEAD:scripts/m41/resume-preflight.mjs |
  node --input-type=module - "$gpir_release_repo" --after-cms --resume-import --background
read -r gpir_pid gpir_log < <(python3 - <<'PY'
import json
from pathlib import Path
p = Path('/workspaces/m41-full-cutover-suddBZ/.migration-data/m41-cutover/background-launch.json')
d = json.loads(p.read_text())
print(d['pid'], d['log'])
PY
)
tail --pid="$gpir_pid" -n 60 -f "$gpir_log"
GPIR_M41_BATCHES
```

Success is not a batch checkpoint or background launch. Final migration coverage,
production source switch, public bytes and real authorized protected Payload read
remain required for overall M41 closure. Preserve a failure/cursor instead of
starting a duplicate runner.

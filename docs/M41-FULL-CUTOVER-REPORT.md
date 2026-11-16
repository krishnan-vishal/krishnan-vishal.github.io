# M41 — consolidated implementation and handover report

15 November 2026. Sole PR: #580, branch
`fix/m41-cloudflare-sharp-admin-runtime-20261115`.

**Source implementation and private release handover are prepared. Overall M41
remains OPEN until production execution and live acceptance are evidenced.**

## Accepted deployment

CMS source `10b81140a90b0ef103c7f25be3d78323c659c3a6` and version
`7d486b4a-4992-4be6-8fd4-64248b2dea9d` remain the accepted deployed baseline.
The accepted login, populated collections, password compatibility, Hyperdrive
verify-full and CA are retained. No password conversion, schema/dependency change,
threshold reduction or Contentful write or deletion is included in this continuation.

## Coverage and source behavior

| Area | Prepared implementation |
| --- | --- |
| Public inventory | 928 files / 184,995,679 bytes |
| Managed content | 835 files / 182,822,474 bytes: HTML, media, reference data, routes and FX editorial dependencies |
| Preserved engines/styles | 93 Git/Supabase-controlled files; CMS materialization verifies it does not overwrite them |
| Editorial migration | All source types, IDs, locales and draft/validation states retained; published mirrors use Delivery bytes |
| Research authority | Reviewed native records replace the same migrated identity; research mirrors are read-only |
| Native withdrawal | Adoption ledger prevents resurrection of the migrated edition |
| Research release | Fresh Supabase decisions; existing content slot, FX/route metadata; new immutable Payload snapshot |
| Website source | Signed Payload snapshot and committed primary-source lock; no silent repository fallback |
| Protected content | Existing Supabase ALLOW precedes Payload lookup; successful responses identify the actual editorial source for live verification |
| Alert editorial source | Existing publisher/draft job gain Payload adapters; original source checks, 95 threshold and 12-hour rules remain |
| Contentful BCP | Existing Contentful content unchanged; read-only source export retained; new synchronization deferred and not a cutover gate |
| Native BCP tooling | Separate reference/media/published/draft recovery capability retained, but not executed during this cutover |
| Execution | One private runner: preflight, CMS deploy, import, research edition, existing consumers, source lock, existing-PR merge and live checks; zero Contentful writes |

`routes.json` is included in the existing public-build allowlist because Search and
ASK GPIR already request its governed route metadata. Internal files remain excluded.

The native-research/mirror gap recorded at checkpoint `42f9822` is resolved in source
by `editorial-source.ts`, `prepare-site-release.ts` and `research-edition.cjs`.
This does not promote imported drafts: native review and Supabase release decisions
remain mandatory for new research editions.

## Validation

- The prior 84 focused checks passed at checkpoint `2844a41`. This continuation adds
  two Contentful read-only enforcement tests and changes only runner/workflow/BCP
  write policy. The 15 policy tests and 29 protected-reader tests pass, including both new guards
  and the real-source response-header assertion. The combined
  focused inventory is now 86 checks; current-head CI is recorded in PR #580.
- TypeScript, OpenNext Worker build, public allowlisted build/inventory, changed
  script syntax and whitespace checks: PASS. Build used dummy build-only settings;
  it did not connect to production or exercise an authenticated reader session.
- Secret scanner: zero unapproved findings. One previously reviewed runtime-header
  line moved from 117 to 124; fingerprint, scanner patterns and scope are unchanged.
- Private runner attempted here and stopped before production stages because the
  existing private env/CA paths are unavailable. No production stage executed.
- Remote current-head Actions must be read from PR #580 after source push; local
  results are not presented as remote CI.

## Production evidence still required

| Acceptance | Evidence from this session |
| --- | --- |
| Real full source-to-Payload reconciliation | NOT RUN |
| Deployment of new source | NOT RUN; accepted deployment above unchanged |
| Production source switch | NOT RUN |
| Contentful synchronization | DEFERRED by owner; no writes or extra BCP gate |
| Live authenticated reader/dashboard acceptance | NOT PERFORMED |
| New live source marker | Previous targeted request followed www redirect and returned 404 |

GitHub updates are available. Authenticated Codespace terminal, Cloudflare session
and private CMS/Contentful/Supabase settings are not available here. Both gh and
Wrangler report no login; no relevant private settings exist in this process.
No access, deployment version or live acceptance is invented. Original checkouts,
uncommitted work and stashes remain untouched.

## Handover

[M41 production handover](M41-PRODUCTION-HANDOVER.md) provides one execution block
for the existing authenticated Codespace. It creates an isolated worktree and uses
the existing private settings without printing or committing them. It checks access,
settings, actual existing JWT policies and exact-head CI before production stages.

Successful private execution records `LIVE_STATIC_CUTOVER_VERIFIED_CONTENTFUL_UNCHANGED`, actual
commits/versions/coverage/recovery-baseline evidence and anonymous protection in the report
and PR body. That status does not claim a real authenticated reader session; final
browser acceptance must be observed before declaring overall M41 complete.

**Contentful remains entirely unchanged.** Existing publications, assets, models and
history receive no writes or deletions. Automatic BCP sync is removed from both
release and scheduled-draft workflows; BCP writes are denied by default. The original
Contentful edition is the retained BCP baseline. Subsequent Payload edits are not
synchronized until separately authorized; that work does not delay primary cutover.

## Owner-executed preflight / existing-access correction

The owner ran the provided batch in Codespace at 1c353a2. It created its worktree
and stopped with stages=[] on three explicit variables: CONTENTFUL_DELIVERY_TOKEN,
CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. No production migration/deployment
or Contentful write occurred. The runner now reuses existing Wrangler login,
selects only the account verified by the known Hyperdrive binding, and reuses an
existing Delivery key through GET-only management access. It never creates or
prints a token and does not copy an OAuth session to GitHub secrets. Eleven new
focused access-resolution tests pass; previous migration/build checks are retained.
The handover resumes the clean failed worktree rather than creating another one.
Real private execution and live acceptance remain pending; no new deployment is claimed.

## Owner's second preflight — CMS/Core isolation fix

Owner resumed 1e41d42; stages=[]; stopped at the runner's old hard-coded project
check. No production or Contentful changes occurred. The correction separates
verified CMS database/Hyperdrive configuration from the Core target derived from
the unchanged website configuration. Core functions and release decisions stay
on Core; the CMS URL and credentials are not rewritten. Existing Core credentials
are verified read-only and kept server-only. Eighteen access/isolation tests pass;
resume selection no longer pins a single historic commit. Actual private execution
and live acceptance remain outstanding. No guard was simply removed to force a
deployment and no project, schema, authentication or entitlement was migrated.


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


## 2026-11-16 — saved batch 800; standalone child shutdown corrected

Owner's 35ef3ad run emitted BATCH_CHECKPOINT_SAVED at blobs:800, created=124,
reconciled=676, completedBlobs=800. That is a completed 25-operation batch
(24 created, 1 reused) beyond the prior 775 checkpoint, matching the observed
742 -> 766 distinct objects. The parent then reported non-success using only the
child's warning/stdout. No subsequent data error was recorded in that output.

Confirmed code defect: the child printed success before an unbounded
payload.destroy()/process shutdown, without explicitly exiting. The previous
exit/signal/timeout metadata was omitted, so the exact termination signal is not
claimed. The email-adapter warning is informational for this import; no email
adapter, environment setting or credential is required to address this failure.

Both standalone Payload children in this release (full-site import and native
research-edition preparation) now bound teardown to five seconds, record safe
cleanup status and explicitly exit after flushing output. This is after awaited
database operations and durable cursor/report writes. Task/query failures still
exit nonzero and are never converted to success. Teardown errors/deadlines are
reported separately; operating-system process exit closes leftover handles of
this isolated child. No Worker/runtime lifecycle or TLS policy changes.

The parent logs saved cursor plus cleanup status; non-success diagnostics now
include exit code, signal and spawn error code. The existing saved cursor takes
precedence, so continuation starts at 800 without repeating 775-799. The same
shutdown fix applies to the next existing research CLI to avoid the identical
post-success wait there. Only these two reviewed offline files are excluded from
unchanged Worker-source comparison and named in the pinned import-source allowlist.

50 focused tests and JS syntax PASS locally. New cases cover normal/stalled/error
cleanup, preservation of a genuine task failure despite cleanup failure, and an
actual standalone child with leftover handles flushing and exiting successfully.
Full-app TypeScript/Worker/Integrity CI remains required before private execution.
No new secrets, variables, dependencies, services, schema/role/entitlement changes,
Contentful writes, CMS rebuild or repeat export. The repaired session and original
input/cursor remain. Actual final import/source switch/live acceptance pending.

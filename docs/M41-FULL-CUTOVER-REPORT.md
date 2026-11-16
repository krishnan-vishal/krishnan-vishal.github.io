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

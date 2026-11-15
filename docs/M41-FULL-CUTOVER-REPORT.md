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
threshold reduction or Contentful deletion is included in this continuation.

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
| Protected content | Existing Supabase session/entitlement ALLOW precedes Payload lookup |
| Alert editorial source | Existing publisher/draft job gain Payload adapters; original source checks, 95 threshold and 12-hour rules remain |
| Contentful BCP | Additive unpublished recovery objects, bounded indexes, remote read-back and independent reconstruction |
| Native BCP state | Reference records, media bytes, published edition and pending draft kept separately |
| Execution | One private runner: preflight, CMS deploy, import, research edition, BCP proof, existing consumers, source lock, existing-PR merge and live checks |

`routes.json` is included in the existing public-build allowlist because Search and
ASK GPIR already request its governed route metadata. Internal files remain excluded.

The native-research/mirror gap recorded at checkpoint `42f9822` is resolved in source
by `editorial-source.ts`, `prepare-site-release.ts` and `research-edition.cjs`.
This does not promote imported drafts: native review and Supabase release decisions
remain mandatory for new research editions.

## Validation

- 25 focused CMS/native-edition/release tests and 59 related protected-reader,
  alert/editorial/draft and scanner tests: **84/84 PASS**.
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
| Real Contentful sync/read-back/reconstruction | NOT RUN; client tests only |
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

Successful private execution records `LIVE_STATIC_CUTOVER_AND_BCP_VERIFIED`, actual
commits/versions/coverage/recovery evidence and anonymous protection in the report
and PR body. That status does not claim a real authenticated reader session; final
browser acceptance must be observed before declaring overall M41 complete.

**Contentful remains intact: no existing publications, assets, models or history
are deleted or retired.**

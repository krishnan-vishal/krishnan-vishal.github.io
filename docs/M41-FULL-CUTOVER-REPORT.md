# M41 full website cutover — implementation and execution report

15 November 2026. Sole change vehicle: PR #580, branch
`fix/m41-cloudflare-sharp-admin-runtime-20261115`.

**Overall status: IN PROGRESS. Production cutover is not complete.**
This report distinguishes implemented code, local evidence and unavailable
production execution. It does not reopen the accepted infrastructure/login work.

## Accepted production baseline

Owner-reported deployed CMS source `10b81140a90b0ef103c7f25be3d78323c659c3a6`,
Worker version `7d486b4a-4992-4be6-8fd4-64248b2dea9d`.
Successful editorial login, populated research/media collections, existing-password
compatibility, Hyperdrive verify-full, prior 34 tests and prior workflows are
accepted as supplied. Dependencies have not changed in this implementation.

## Available access

Connected GitHub can read/update the existing PR branch. A separate clean checkout
was used. `/workspaces/m41-pr580-release` and the owner's private env/CA are not
mounted here. `gh auth status` reports no login; `wrangler whoami` reports no
Cloudflare authentication; the current environment contains no Payload,
Contentful, Supabase or Cloudflare private settings. The available browser has
no Codespace session open. Original checkouts, uncommitted work and stashes
were not modified. No credentials were requested, printed or committed.

## Source implementation

- Existing public-build allowlist defines the migration boundary. Local build:
  **927 public files / 184,982,170 bytes**. The migration selects **834 managed
  files / 182,808,965 bytes** including HTML, media, reference JSON, navigation
  markup and the FX editorial bridge. **93 CSS, JavaScript and generated engine
  files** remain under their existing Git/Supabase contracts.
- `full-site.ts` adds restartable content-addressed imports using the existing,
  versioned `editorial-metadata` collection; no production DDL or public Supabase
  schema change. Complete Contentful exports, every content type, locale and
  source state are retained privately. Published editorial mirrors come from
  actual Delivery API bytes; unpublished Management revisions remain separate.
  Draft/WARN records are not relabelled PASS. Existing native research drafts
  are not promoted or overwritten.
- Authenticated signed snapshot endpoint and build consumer materialize Payload
  bytes at the same paths. Missing/corrupt/changed baselines fail before deployment.
  `GPIR_CONTENT_SOURCE=payload` selects Payload explicitly. Runtime page reads
  remain static; no browser CMS key or per-reader CMS dependency is introduced.
- Existing alert publisher and existing draft-handoff script gain a Payload
  editorial adapter. Reviewer approval and immutable identities are enforced;
  the machine endpoint can only create/refresh untouched drafts. Existing source
  checks, Supabase publication decisions, confidence thresholds and 12-hour
  expiry/archive logic are retained. No automatic Contentful fallback when
  Payload is selected.
- Immutable unpublished Contentful recovery objects use bounded compressed chunks
  and paginated indexes. Existing Contentful entries/assets are never overwritten
  or deleted. Sync verifies recovery by reading objects back from Contentful.
  The existing draft schedule can sync editorial changes after Payload selection.
  Recovery writes into a new private directory; a separate Payload restore tool
  rejects conflicting existing records rather than overwriting editorial work.
- Existing Payload release workflow is extended to full-site build, BCP read-back,
  existing website Worker deployment and live byte checks. It creates no PR.
  PREVIEW does not deploy; RELEASE requires configured cutover authorization.

## Checks actually completed

- 10 new migration/manifest, signature/failure, byte-preservation, BCP round-trip,
  remote-client idempotency, editorial-role and no-fallback tests: PASS.
- 24 existing alert editorial approval and draft-handoff tests: PASS, including
  original timestamps, 12-hour archival and fresh approval re-read.
- TypeScript: PASS. Next/OpenNext Worker build with dummy build-only configuration:
  PASS; Worker entrypoint and assets emitted. The first build attempt used an
  external dependency symlink and was rejected by Turbopack's hermetic root;
  isolated local dependencies resolved that environment issue. No production
  connection was exercised by this build.
- Public allowlisted build: PASS. Secret scanner: zero unapproved findings.
  Generated output initially caused scan noise/buffer exhaustion; moving build
  artifacts outside the source checkout resolved this without changing scan rules.
  `git diff --check`: PASS.
- Live request followed www redirect: `/assets/data/cms-source.json` returned
  **HTTP 404**. This is evidence that this implementation's source marker is
  absent; it is not evidence of an existing production fault.

## Production evidence not obtained

| Required acceptance | Current evidence |
| --- | --- |
| Full source-to-Payload content reconciliation | Import code and local inventory only; private execution not run |
| Production CMS endpoint deployment | Not run; deployed baseline above unchanged |
| Website source switch and lasting build configuration | Not run; no new deployment version |
| Payload editorial source in deployed alert publisher | Adapter tested locally; deployed function/secrets not changed |
| Contentful BCP synchronized and recovered | Mock/client tests only; no real Contentful writes or recovery |
| Live URL/media/ticker/card/ASK/dashboard acceptance | Not established by this session |
| Current-head GitHub checks | Must be read from PR after push; local results are not remote CI |

## Remaining implementation and acceptance boundaries

The static snapshot path is an initial byte-preserving cutover mechanism, not a
claim that every future native research edit already regenerates all existing
pages. The current native `research-publications` release and the managed-site
snapshot still need a reconciled edit-to-release contract before claiming that
future editorial updates automatically propagate across the full website.
The new metadata editorial mirror preserves existing delivered editions, but
native research edits and mirrored records must not become competing authorities.
This is an explicit remaining implementation item, not a private credential issue.

Private execution additionally needs the existing scoped CMS/Contentful settings,
authenticated deployment sessions, and source settings in the production build,
existing draft workflow and Supabase publisher. These settings must be reconciled
across all three so a later normal build cannot silently restore the repository
or Contentful as primary. Existing release decisions remain authoritative.
Do not execute RELEASE or mark M41 complete until both the implementation item
above and the production evidence table are closed.

Useful entry points, after that implementation reconciliation:

- Build baseline with `GPIR_CONTENT_SOURCE=repository node scripts/build-cloudflare-preview.js`.
- In the CMS app, run `node --import tsx src/migration/full-site.ts --site=../../.cloudflare-preview-dist --backup=PRIVATE_EXPORT_DIRECTORY`.
- Use the emitted snapshot for the private Payload source configuration.
- `node scripts/m41/sync-site-bcp.cjs` emits a distinct recovery snapshot and
  verifies actual Contentful read-back.
- `node scripts/m41/recover-site.cjs RECOVERY_SNAPSHOT NEW_EMPTY_DIRECTORY`.
- In the CMS app, `node --import tsx src/migration/restore-bcp.ts RECOVERED_RECORDS_JSON RECOVERY_SNAPSHOT`
  restores matching metadata without publication or overwrites.
- Full-site PREVIEW/RELEASE uses the existing Payload release workflow and
  `verify-live.cjs`. Its byte verification explicitly does not assert successful
  authenticated engine behavior.

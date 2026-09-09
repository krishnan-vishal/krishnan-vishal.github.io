# GPIR FX Pricing & Treasury (M28-FX)

Architecture, schema and operating notes for the FX Pricing & Treasury
milestone. Complements [ARCHITECTURE_GUARDRAIL.md](ARCHITECTURE_GUARDRAIL.md)
and [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md); does not replace them.

## Pipeline

```
scheduled GitHub Action (.github/workflows/fx-market-data.yml)
  -> scripts/fx/providers/index.js provider-priority walk
     (licensed provider, if a credential secret exists -> ... ->
      reference-open-er-api, always available, keyless)
  -> normalization (scripts/fx/normalize-validate.js)
  -> previous-business-day variance (scripts/fx/business-day.js)
  -> deterministic validation / anomaly quarantine
  -> assets/data/fx/current.json (+ assets/data/fx/weekly-summary.json)
  -> assets/data/fx/history/YYYY/MM/YYYY-MM-DD.json (frozen once, on
     the first run of a new UTC day)
  -> scripts/generate-fx-pages.js (static page shells)
  -> automation/fx-snapshot branch pushed, pull request proposed (see
     "Publication model" below -- never a direct write to main)
  -> human review and merge into main -> GitHub Pages deploy
  -> static GPIR front end (assets/js/fx-ticker.js, assets/js/fx-app.js)
```

`node scripts/fx/generate-fx-snapshot.js` is the single entry point for
data generation; `node scripts/generate-fx-pages.js` regenerates the
page shells (needed after `fx-config.json`'s `featuredPairs` changes,
or after a new history file is frozen, so the Historical archive's
date list stays current). `node scripts/validate-fx.js` is the CI-style
check (mirrors `scripts/validate-content.js`).

## Data files

All under `assets/data/fx/` (this repository's convention is
`assets/data/`, not a top-level `data/` directory):

- `fx-config.json` -- `featuredPairs` (the curated ticker/indexed-page
  universe) and `marketRegions` (its GPIR regional presentation groups),
  `providerPriority`, per-providerType staleness thresholds, the
  extreme-movement threshold, and the reader-facing disclaimer text.
- `current.json` -- the latest snapshot. `status` is always `"current"`;
  `dataStatus` is the run-level outcome (`OK`,
  `PROVIDER_UNAVAILABLE_SERVED_LAST_KNOWN_GOOD`, or
  `NO_PROVIDER_CONFIGURED`). Each `pairs[]` record matches the schema
  in `scripts/fx/normalize-validate.js` -- every field GPIR does not
  have (no TOM/spot/cash from a reference-only source, no bid/ask
  spread, etc.) is `null`, rendered "N/A" by the front end. A computed
  cross-rate is always `rateType: "derived-cross"` with `sourceLegs`
  recorded; it is never presented as a provider-native quote. When the
  active adapter supplies a validated common-base table, `currencyUniverse`
  retains those rates, currencies, provider/timestamp metadata and the
  genuine previous-business-day table for on-demand Explorer calculations.
- `history/YYYY/MM/YYYY-MM-DD.json` -- one immutable frozen daily
  snapshot (`status: "historical"`). `scripts/fx/generate-fx-snapshot.js`'s
  `freezeOutgoingSnapshotIfNewDay()` writes this the first time a run
  notices the calendar date has moved on from the outgoing
  `current.json`, and **never overwrites an existing file** -- see
  `scripts/test-fx.js`'s historical-immutability test.
- `weekly-summary.json` -- deterministic quantitative observations only
  (open/high/low/close/range/direction plus the exact observations used)
  computed from the last 7 validated business-day closes per pair, including
  the latest current observation when valid, via `scripts/fx/weekly-summary.js`. Never
  editorial/market-driver commentary; a pair with fewer than 2 archived
  closes reports `dataCompleteness: "NO_DATA"` / `"INSUFFICIENT_HISTORY"`
  rather than a manufactured figure.

## Provider adapters

`scripts/fx/providers/`:

- `reference.js` -- the reference/fallback tier. Fetches
  `https://open.er-api.com/v6/latest/USD`, the same public, keyless
  endpoint `assets/js/fx-ticker.js` already called directly from the
  browser in production before this milestone; it is not a new
  third-party relationship, only moved server-side so a future
  licensed provider's credentials never need to reach client
  JavaScript. `providerType: "reference"`, never `"live"`.
- `xe.js`, `ibrlive.js`, `lseg.js`, `bloomberg.js` -- licensed-provider
  stubs built on `licensed-provider-base.js`. GPIR has no licence,
  credential or verified API specification for any of these vendors
  today. Each stub is a genuine, testable contract (`id`,
  `envVarNames`, `isConfigured()`) that reports `NO_PROVIDER_CONFIGURED`
  cleanly when its credential is absent, and **deliberately throws
  `PROVIDER_INTEGRATION_NOT_YET_IMPLEMENTED`** if a credential is
  present but no verified request implementation has been built yet --
  this repository will not guess at a proprietary vendor request/response
  shape. To activate one: obtain a licence, add the credential as a
  GitHub Actions secret (below), then replace that adapter's
  `fetchPairs()` with a real implementation built against the vendor's
  own documentation (`docsUrl` in each file), and add tests mirroring
  `scripts/test-fx.js`'s reference-provider coverage.
- `index.js` -- `PROVIDER_PRIORITY`, in order: `lseg`, `bloomberg`,
  `xe`, `ibrlive`, `reference-open-er-api`. `scripts/fx/generate-fx-snapshot.js`
  tries each in order for the whole run; the first provider that
  returns any usable record wins that run. If every provider fails
  (including the always-available reference tier), the orchestrator
  falls back to the last validated snapshot on disk with every
  record's `dataStatus` escalated to `STALE` -- it never fabricates a
  number and never silently republishes a stale snapshot as current.

### Credentials

GitHub Actions secrets only, referenced by `.github/workflows/fx-market-data.yml`,
never committed and never sent to the browser:

| Env var | Provider |
|---|---|
| `FX_LSEG_API_KEY`, `FX_LSEG_API_SECRET` | LSEG licensed market-data feed |
| `FX_BLOOMBERG_API_KEY` | Bloomberg licensed market-data feed |
| `FX_XE_API_KEY` | XE Currency Data API |
| `FX_IBRLIVE_API_KEY` | IBRLive API |

No secret is required for the site to function -- see No-Credential Mode.

## No-Credential Mode (mandatory)

The licensed provider credentials remain optional. If none is configured,
the keyless reference adapter is attempted. If it is also unreachable and a
last-known-good snapshot exists, the pipeline serves it explicitly as stale;
on a first-ever unreachable run it writes the honest
`NO_PROVIDER_CONFIGURED` state with null rates. The committed snapshot on
`main` may therefore be a genuine reference observation produced by GitHub
Actions even though no licensed credential exists.

The UI never breaks or blanks in this state: the ticker/Explorer/pair
pages render their normal structure with "N/A" values and a
`NO PROVIDER CONFIGURED` status badge rather than an error page.

## Historical immutability

`freezeOutgoingSnapshotIfNewDay()` is the only code path that writes to
`history/`, and it refuses to overwrite an existing file (returns
`{ frozen: false, reason: "ALREADY_FROZEN" }` instead). A normal
refresh run only ever writes `current.json`; a correction to a
previously frozen day requires an explicit, separate, human-reviewed
change -- never an automatic overwrite.

## Publication model: review branch + PR, never a direct write to main

`fx-market-data.yml` never commits or pushes to `main`. It mirrors
`continuous-intelligence.yml`'s existing pattern: a validated snapshot
is pushed to the dedicated `automation/fx-snapshot` branch (reusing
that branch across runs the same way `continuous-intelligence.yml`
reuses `automation/intelligence-candidates`), and the workflow then
attempts to open a pull request from it for human review and merge.
`main` -- and therefore production -- is only ever updated by that PR
being reviewed and merged; a scheduled run that finds no change simply
does nothing.

If the repository's Settings > Actions > General > Workflow
permissions does not have "Allow GitHub Actions to create and approve
pull requests" enabled, PR creation fails with a permission error from
GitHub, not a code defect. The workflow does not treat that as a
run failure: it still pushes `automation/fx-snapshot` (a human can open
the PR manually from that branch, or the setting can be enabled so
future runs open it automatically) and records a warning plus a step
summary note rather than failing the job -- exactly the same
degrade-gracefully behaviour already established for
`continuous-intelligence.yml`'s own PR-creation step. Either way,
`main` and last-known-good production data are unaffected until a
human explicitly merges the review PR.

## Validation and tests

- `node scripts/validate-fx.js` -- schema/anomaly/immutability checks
  over `fx-config.json`, `current.json` and every `history/` file
  (CI-style, mirrors `scripts/validate-content.js`).
- `node scripts/test-fx.js` -- previous-business-day resolution
  (including weekend rollover and missing-close handling), percentage
  variance, record validation (numeric/bid-ask/ISO/future-timestamp/
  staleness/extreme-movement), duplicate detection, ticker formatting,
  provider failover (mocked network), historical immutability and the
  weekly-summary engine.
- `node scripts/gpir-perf-audit.js` -- unaffected/no new warnings.

## Reader surfaces

- Homepage `#fx-ribbon` ticker (`assets/js/fx-ticker.js`) -- compact
  single-line format (`USD/INR 88.2000 ▲ +0.34%`), reads
  `assets/data/fx/current.json` (no direct provider call from the
  browser), pauses on hover and keyboard focus, respects
  `prefers-reduced-motion`, links each pair to its FX intelligence page.
- `pages/fx/index.html` (compact regional market table), `explorer.html`
  (full active-provider currency universe with on-demand direct/cross-rate Pair Intelligence),
  `treasury.html` (Treasury Intelligence -- deterministic groupings:
  GCC pegged/managed currencies, INR corridor pairs, USD funding
  pairs, major crosses), `weekly.html` (Weekly Trends), `historical.html`
  (year/month archive navigation), `pairs/{slug}.html` (one per
  featured pair: full LAST/MID/BID/ASK/SPREAD/SPOT/TOM/CASH/variance/
  provider/timestamp table, a dependency-free inline-SVG 7-day
  sparkline, and a link into the Historical archive).
- Every page loads its data on demand (`assets/js/fx-app.js`), never
  embeds the dataset inline. Currency Explorer derives pair views from one
  O(n) common-base table rather than materialising O(n²) records/pages and
  fetches at most seven history snapshots only after a pair is selected.
- The mandated disclaimer appears on every FX page.

## Known gaps / deferred (stated honestly)

- No licensed live provider is integrated (see Provider adapters --
  requires a real licence and a future implementation, not a guess).
- The pair view limits trend retrieval to seven listed immutable snapshots;
  the Historical page remains the complete date-by-date archive.
- `assets/i18n/*.json` was not extended with new FX-page translation
  keys this milestone (consistent with how country/dashboard/
  announcement-archive body content is not i18n-tagged either -- only
  chrome/nav is); the new mega-menu labels use existing patterns.
- CIS/holiday calendars for `resolvePreviousBusinessClose()`'s
  `holidays` parameter are not populated -- weekend rollover is fully
  implemented; per-market holiday lists remain a future, explicitly
  sourced addition (never guessed).

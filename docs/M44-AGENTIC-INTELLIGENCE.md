# M44 — Open-Source Agentic AI Intelligence Enhancement

## Governed status

**IMPLEMENTED LOCALLY / NOT DEPLOYED / NOT PRODUCTION-COMPLETE** as of
2026-11-28. This branch prepares the first production-priority increment without
claiming live acceptance. It does not modify Central Command, coding automation,
M43 archival, authentication, payments, Smart Card designs, Payload authority,
Contentful BCP, or the existing 95% publication gate.

## Production baseline before this branch

Read-only checks on 2026-11-28 established the following actual live state:

| Surface | Result | Meaning |
| --- | --- | --- |
| `https://fintechoisis.com/assets/data/fx/current.json` | HTTP 200, 136,373 bytes, 747 ms; `generatedAt` 2026-11-03T04:32:27.163Z | The last-known-good public snapshot works but was about 25 days old. |
| `https://fintechoisis.com/pages/intelligence/smart.html` | HTTP 200, 29,234 bytes, 371 ms | The approved Smart Intelligence surface is live. |
| `https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-public-intelligence?view=relay` | HTTP 200, 2,553 ms, `total=0` | The governed relay was reachable and truthfully had no qualifying preceding-12-hour item. |
| Same endpoint with `scope=history&limit=5` | HTTP 200, 7,883 ms, `total=6652` | Permanent history exists; the relay request should not pay the history-query cost. |
| Existing `fx_historical_archive` | 16,846 rows, 134 pairs, observations from 2026-01-02 through 2026-11-27 | Historical accumulation is already real and is reused rather than replaced. Of these, 938 legacy captures have no observation date/rate method and remain excluded from analytics. |

An empty relay is not fabricated into acceptance evidence. Relay-to-retirement
proof still requires a genuine future item that passes the unchanged gates.

## Phase 1 implementation

### Bounded Global Alerts relay

The public relay now has a dedicated live query path. It first selects only
approved, ticker-eligible announcements published within the preceding 12
hours. If no row qualifies, it returns without loading the source registry,
topics, developments or topic-source relationships. When rows exist, each
relationship query is scoped to the selected identifiers. The existing history
path, automatic age-based retirement, permanent records and ten-minute
publisher cadence remain authoritative and unchanged.

### Deterministic LangGraph orchestration

The existing `gpir-intelligence-publish` Edge Function is wrapped by a pinned
LangGraph OSS `StateGraph` with explicit `observe`, `curator`,
`validateAndPublish`, `interpret`, and `indexAndEvidence` stages. The graph calls
the existing deterministic publication handler; it introduces no model call,
provider fallback, checkpointer, commercial hosting, vector database, graph
database, scheduler or publication authority. Response headers expose the
orchestrator version and `deterministic-no-llm` operating mode.

This establishes the logical O-C-V-C-I-E execution boundary while preserving the
existing validator and publisher. It does **not** claim that all Phase 2 research
modules are automatically populated.

### FX archive projection and last-known-good delivery

The new service-role-only SQL projection reads the existing
`fx_historical_archive`; it creates no table and accepts no browser credentials.
The public read-only Edge Function converts validated daily observations into a
ten-minute cached current/previous-close snapshot. It rejects malformed rows as
a set and retains an in-memory last-known-good response after transient failures.
It deliberately does not expose historical points, trend analytics or volatility:
those remain in the existing authenticated `gpir-reader-summary` and FX
Intelligence card, preserving the approved entitlement boundary.

The existing public FX component renders the reviewed static snapshot first,
then enriches it in place from the live projection. The configured pair universe,
regions and featured-pair controls continue to come from the static reviewed
artifact. The protected FX dashboard loads existing history and optional
editorial material concurrently, and the reader endpoint obtains the latest
archive capture concurrently with the approved historical provider call. No
approved visual design is replaced.

## Phase 2–4 boundary

- Phase 2: the deterministic graph and existing publication handler provide the
  logical orchestration boundary. Automated population of all research modules,
  Payload publication receipts and Contentful synchronization require separate
  governed runtime evidence.
- Phase 3: the existing Supabase relationships and deterministic ASK GPIR path
  remain in place. No vector or graph database was added. Citation-backed live
  ASK responses were not generated from this undeployed branch.
- Phase 4: Australia, Japan, Brazil and Nigeria already exist in the approved
  country registry with explicit `ACTIVE_AMBER` gaps. This branch does not turn
  missing or unverified fields into published facts. Country dashboard
  population remains pending approved-source evidence and release verification.

## Cost and independence controls

The implementation adds no paid hosting, provider, model inference, database,
schedule, infrastructure commitment or automatic credit purchase. Routine
publisher execution and every Phase 1 response are deterministic and contain no
LLM import. Exhausted or absent LLM quotas therefore do not block these code
paths. This is an architectural zero-increment design; an actual billing receipt
must still be checked after deployment before zero additional expenditure is
accepted as a production fact.

## Local evidence

- Six M44 focused tests pass: bounded empty relay, identifier-scoped evidence
  loads, public FX entitlement boundary, ten-minute cache, deterministic LangGraph
  source boundary, unchanged schedule/design enrichment.
- JavaScript syntax checks pass for all changed browser and handler modules.
- `validate-fx.js`, `validate-announcements.js`, `validate-content.js`,
  `validate-links.js` and `git diff --check` pass. The advisory performance
  audit completes with seven existing estate warnings and no blocking error.
- The high-confidence secret scan passes with zero unapproved findings. The
  PostgreSQL acceptance fixture exercises the service-only FX projection. On
  exact commit `ac9db639fa566ee9ff937d69ccfe92d569457c05`, PR #728 runs
  46086186274 (PostgreSQL), 46086186311 (targeted tests), 46086186307
  (Security and Integrity), 46086186279 (M40 gate), 46086186273 (BIS/GDELT),
  46086186242 (M37 gate) and 46086186235 (Payload CMS) all passed.
- Read-only production schema inspection confirmed the migration's referenced
  columns and the 16,846-row/134-pair archive. Current Supabase advisors report
  no health findings; existing security/performance advisories are outside M44
  and were not silently modified.
- The combined relevant suite reports 74/76 passing. Its two failures are stale
  assertions reproduced against the starting `origin/main`: an obsolete text
  phrase in `smart.html` and an obsolete `view:'history-records'` literal. M44
  does not change those contracts or weaken the tests.
- `test-announcement-intent.js` emits 19 failure lines from its unchanged
  `content-search.js` fixtures. M44 changes none of that script, search module or
  announcement data; the pre-existing failures remain visible and unweakened.

## Controlled deployment and live acceptance

1. Review and apply `20261128120000_m44_fx_snapshot_projection.sql`.
2. Deploy the reviewed `gpir-public-intelligence` revision with its existing
   public verification boundary.
3. Deploy `gpir-fx-snapshot` as a public read-only function (`--no-verify-jwt`);
   verify that the service-role credential remains server-side.
4. Deploy the reviewed `gpir-intelligence-publish` and `gpir-reader-summary`
   revisions with their existing JWT boundaries.
5. Merge and publish the reviewed Pages assets through the existing release path.
6. Capture warm/cold relay and FX latency, cache headers, archive growth, FX
   observation growth, card rendering, authenticated ASK citations, the four
   initial country dashboards and billing evidence.
7. Observe one genuine qualifying announcement enter the 12-hour relay, retire
   automatically and remain discoverable in permanent history.

Until those steps occur, no new live URL, responsiveness improvement, archive
growth, country population, ASK response or expenditure outcome is classified as
accepted. Database recovery is
`supabase/rollback/m44-agentic-intelligence.rollback.sql`; Edge recovery is a
redeploy of the preceding reviewed revisions; Pages recovery is a reviewed
revert through the existing release chain.

## Production checkpoint

On 2026-11-28, the owner authorized the release of merged PR #728 at
`252aa000ecb240bbc06c1dcd9e0959a210b33923`. GitHub Pages run
[46087144400](https://github.com/krishnan-vishal/krishnan-vishal.github.io/actions/runs/46087144400)
succeeded and the released ticker and FX Intelligence assets were fetched on
the production domain. The Payload source marker also returned HTTP 200.

Supabase recorded `m44_fx_snapshot_projection` as migration `20261128001856`.
Readback confirmed execute access for `service_role` only. Production function
receipts were `gpir-public-intelligence` v28, `gpir-fx-snapshot` v1,
`gpir-intelligence-publish` v18 and `gpir-reader-summary` v41. A guest call
to the reader summary returned HTTP 401.

Publisher response 10698 at 00:22:14 UTC returned HTTP 200, with all seven
LangGraph OSS 1.7.5 stages, the `deterministic-no-llm` header and a successful
editorial read of 62 entries. A cold scheduled invocation reached the existing
five-second pg_net response timeout before that successful controlled invocation.

The relay returned HTTP 200 in 1,526 ms, compared with the 2,553 ms baseline
single probe. History still reported 6,652 records. The last qualifying source
item, `6b6ffb23-87ba-4dae-9e7a-618797b628eb`, was automatically published
at 09:50:03 UTC on 2026-11-27 with confidence 100 and the exact source
timestamp of 09:00:53 UTC. It was past its 21:00:53 UTC expiry at the production
check and remained approved in the archive. This is audit and retirement
evidence for a pre-release article. A new article observed through the deployed
relay remains pending.

The public FX endpoint served observations through 27 November, but returned
only 42 pairs because the REST gateway capped the 3,248-row projection.
The archive retained 16,846 rows (15,908 dated) and all 134 pairs. The
follow-up migration returns at most two observed dates per pair. A read-only
production query returned 268 rows, all 134 archive pairs and zero missing
pairs. The corrective migration requires the governed review and release.
Account billing and signed-in FX browser performance remain unverified.

## Production acceptance after PR #731

The owner merged PR #731 as `b5334c033a98aa1f2e45c5889d43a89697dc58e3`.
The PostgreSQL and Security and Integrity checks passed, and Pages run
46088055991 succeeded. Supabase applied the reviewed SQL as
`20261128003206 m44_fx_projection_pair_coverage`.

The production RPC returned 268 records, exactly two per pair, for all 134
configured pairs. The public HTTP response matched the 134-pair universe
with no missing or extra pair. USD/INR returned 92.520426 for 27 November
and a previous close of 92.345212 for 26 November. The homepage displayed
USD/INR at 92.5204 (+0.19%) in its 26-pair featured ticker. Currency Explorer
also displayed the non-featured USD/NGN pair through the existing selectors.

The archive contained 16,846 rows before and after the migration. A digest
over all pre-existing rows ordered by ID was unchanged
(`3a8c397175b30b583fe78199be4c0843`). RPC execution remained service-role
only and the unauthenticated reader endpoint returned 401. No Smart Card
assets were changed in PR #731. The signed-in timing requires an authenticated
reader session.

ASK GPIR and history each returned announcement
`6b6ffb23-87ba-4dae-9e7a-618797b628eb` as historical and archived with
the cited source and exact timestamp `2026-11-27T09:00:53Z`. The audit
records automatic publication at `2026-11-27T09:50:03.235621Z` at
confidence 100. A live observation of a post-release article is pending.

The production HTTP receipts for the 00:20 and 00:30 UTC scheduled publisher
calls timed out at the inherited five-second limit despite successful SQL
queueing. The existing job 4 gained an explicit `timeout_milliseconds :=
120000`. A reverse-replacement digest comparison confirmed that the
timeout was the only command change. Its ten-minute cadence, request body
and Vault authorization were preserved. The original command is recovered
by removing the exact added timeout argument under the same job and digest
guards. No new cron job or additional SQL migration was used for this
configuration correction.

From 06:10 to 11:30 IST on 28 November, while ChatGPT Work was unavailable,
Supabase matched 33 of 33 ten-minute cron runs to HTTP 200 responses from
LangGraph OSS 1.7.5 in `deterministic-no-llm` mode. There were zero HTTP
timeouts and zero new publications. The first and last cron run IDs were
73716 and 74744, matching response IDs 10702 and 10772. The final receipt
reported all seven graph stages and a successful read of 62 editorial
entries. No manual publisher call was used in this interval.

## Agent integration and supplementary FX review

The reviewed branch uses the deployed LangGraph dependency to run the
existing publisher operations in separate stages. Editorial candidate reads
are batched in groups of 40. The existing audit and publication RPCs remain
authoritative. The research graph ranks phrase and keyword matches in one
ASK GPIR request after the existing entitlement split. Country risk profiles
can attach up to three cited repository records by explicit country
geography. A source's domicile alone does not attach a record to a country.

The relay keeps its single-query empty path. A non-empty result includes
predecessor records within the existing grouping horizon. This allows the
earliest report to determine retirement when a later report corroborates it.

On 28 November at 06:29–06:32 UTC, production had 16,980 FX archive
rows, up 134 since the previous receipt, and 392 approved announcement rows.
Public history returned 6,652 records in 10.16 seconds. In the preceding
12 hours, 84 successful source runs reported 41 discoveries, including
repeated discoveries. Four new PYMNTS candidates scored 50, 70, 70 and 85
and stayed in review. The relay had no qualifying publication during
the check.

Read-only supplier review on 28 November concluded:

- **Twelve Data.** Basic offers 8 credits per minute and 800 per day, with
  Forex coverage described for 140 currencies across the product.
  The free tier is internal and non-display. Public redistribution requires a
  separate agreement. [Pricing](https://twelvedata.com/pricing-business) ·
  [Licensing](https://support.twelvedata.com/en/articles/5332349-commercial-and-personal-usage).
- **ExchangeRate-API.** GPIR already uses the keyless Open Access feed.
  Its daily response contained 166 currency codes and covered all 134 GPIR
  pairs. Keyed Free offers 1,500 calls per month. Standard terms allow
  attributed end-use and caching but prohibit public redistribution and
  programmatic re-serving. Account-specific permission for GPIR's public
  snapshot was not available in the release evidence. [Open Access](https://www.exchangerate-api.com/docs/free) ·
  [Terms](https://www.exchangerate-api.com/terms).
- **Alpha Vantage.** The standard free allowance is 25 requests per day.
  Pair-specific endpoints offer historical FX series, so the standard quota
  cannot cover all 134 pairs daily by individual lookup. Commercial use
  requires written agreement. [Allowance](https://www.alphavantage.co/support/) ·
  [FX endpoints](https://www.alphavantage.co/documentation/#fx) ·
  [Terms](https://www.alphavantage.co/terms_of_service/).
- **CurrencyFreaks.** The free keyed plan offers 1,000 requests monthly and
  daily USD-base updates. The separate keyless fair-use Open Rates endpoint
  returned 170 quote codes on 28 November. All 134 GPIR pairs are derivable
  when the USD base is treated as an identity rate. Its standard terms
  describe restricted end-user reference display. Rights for public API
  redistribution and an append-only public archive remain unverified.
  [Pricing](https://currencyfreaks.com/pricing) ·
  [Open Rates](https://currencyfreaks.com/open-rates-api) ·
  [Terms](https://currencyfreaks.com/tos).

No proposed provider was enabled or given a credential. Existing
ECB/Frankfurter coverage, the 134-pair contract and the FX archive were
preserved. Account billing evidence was unavailable.

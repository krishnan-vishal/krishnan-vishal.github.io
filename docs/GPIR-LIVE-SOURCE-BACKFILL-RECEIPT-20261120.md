# GPIR live source activation and five-year backfill receipt — 2026-11-20

## Release identity

- Repository branch: `codex/gpir-live-intelligence-backfill-20261120`
- Owner-review pull request: #605
- Production receipt head before the PR-number follow-up: `dc3968729a0656d5ddb1e5d97649624dc5ee2305`
- Supabase project: `qlnvhfapctcpzqyuhhth`
- Deployed function: `gpir-intelligence-fetch` v65, JWT verification enabled
- Historical window: `[2021-11-19T00:00:00Z, 2026-11-19T00:00:00Z)`
- Windowing: 60 contiguous monthly windows per activated historical source

No merge to `main` or website publication was performed. Vishal Krishnan retains
the repository merge and public-release approval.

## Source reconciliation

| Source | Operational state | Evidence and boundary |
|---|---|---|
| FinTech News Singapore (`FINTECHNEWS-SG-008`) | GREEN; hourly at :50 | Public payments RSS and official WordPress category API returned canonical article URLs, exact UTC dates and readable article evidence to the declared GPIR agent. |
| Atlas Technologies Research (`ATLAS-APAC-009`) | GREEN; hourly at :55 | Public payments-research RSS and official WordPress category API returned canonical article URLs, exact dates and readable article evidence. |
| Finextra Payments (`FINEXTRA-PAY-006`) | DISABLED; unscheduled | The registered feed currently returns HTTP 403 to the declared GPIR agent. No bot-control bypass was attempted. |
| FXC Intelligence (`FXC-GLOBAL-010`) | DISABLED; unscheduled | Reconciled as T3 discovery-only. Current research bodies are access-controlled; no paywall or access-control bypass was attempted. |

The two active sources remain T3. Automatic publication still requires confidence
at least 95, at least 1,000 characters and three evidence sentences, at least
three relevant terms, a GREEN registry record, canonical-host validation, a
genuine source timestamp, a grounded summary and deduplication.

## Production acquisition receipt

| Source | Official five-year total | Database records in window | Distinct URLs | Distinct hashes | Missing timestamps | Complete windows |
|---|---:|---:|---:|---:|---:|---:|
| FinTech News Singapore | 1,680 | 1,680 | 1,680 | 1,680 | 0 | 60 |
| Atlas Technologies Research | 49 | 49 | 49 | 49 | 0 | 60 |

FinTech News has ten additional current-feed records after the historical upper
bound, for 1,690 total staged records. Atlas's nine current-feed canary records
fall inside its historical range and were skipped before the page-fetch cap.
Atlas coverage begins on 2 July 2025; earlier monthly windows are successful
zero-coverage receipts, not inferred records.

The historical publisher drain completed when an explicit five-year request
returned zero processed candidates. It evaluated 1,153 not-yet-final candidates:
186 published, 962 remained review-only, five were rejected by existing rules
and zero were marked duplicate in that drain. Together with publication work
performed by the existing ten-minute scheduler during acquisition, final
source outcomes were:

| Source | Candidates | Confidence >=95 | Approved archive announcements | Live ticker eligible |
|---|---:|---:|---:|---:|
| FinTech News Singapore | 1,687 | 289 | 188 | 0 |
| Atlas Technologies Research | 49 | 3 | 3 | 0 |

All 191 approved records preserve their source date and canonical URL. None was
relabeled as current. The live 12-hour endpoint returned HTTP 200 with an empty
`alerts` array, which is the truthful outcome because no activated-source item
both met every publication gate and remained inside the live window. A history
query returned the new records with `CONTENT_VERIFIED`, `HISTORICAL` /
`ARCHIVED`, source attribution, grounded summary and `tickerEligible=false`.

## Operational observations

- Fetch v63 completed both source canaries and staged 19 current-feed records.
- Fetch v64 failed its first request at boot because callback-local `continue`
  statements were invalid after a bounded-concurrency change. That request
  returned `BOOT_ERROR`; no historical record was written.
- The defect was corrected, regression-tested and pushed. Fetch v65 then
  completed the oldest historical canary and all 120 source windows.
- One FinTech News API request failed with a transient HTTP/2 connection error.
  The window did not advance; a bounded retry completed it without duplicates.
- The first concurrent dry-run request also saw a transient Supabase
  `JWT issued at future` error. A serial retry passed without changing auth.
- The first scheduled jobs were observed end to end: FinTech News at 06:50 UTC
  and Atlas at 06:55 UTC. Both cron runs succeeded and both Edge runs completed
  `SUCCESS`, checking 10 and nine feed links respectively with zero unseen
  items, zero fetch/processing errors and zero duplicate writes.

## Validation receipt

- 16 source/backfill tests passed.
- 18 existing automated-publication tests passed.
- Content, internal-link and announcement validators passed.
- Performance audit completed with existing advisory warnings only.
- `git diff --check` passed.
- `scripts/test-announcement-intent.js` continues to report five pre-existing
  governed-query fixture failures. This branch does not change that script or
  its static announcement/query fixtures; no assertion was weakened.

## Remaining live acceptance

Hourly acquisition and the existing ten-minute publisher are active. Final
source-to-live-to-expired proof requires a genuine future article from one of
the active sources to meet every unchanged T3 gate while still inside 12 hours.
Until that happens, an empty live relay is correct and must not be populated by
lowering confidence, approving a backfilled item or inventing a timestamp.

# M42 — OFAC, FATF and Global Country Risk Monitor

Date: 2026-11-19  
Status: IN PROGRESS — IMPLEMENTED ON WORKING BRANCH; NOT DEPLOYED OR PRODUCTION-ACCEPTED  
Owner: Vishal Krishnan  
Working branch: `codex/ofac-fatf-country-risk-monitor`  
Base: `main` at `5165bbff72ea18e5fd5365aca960bc5f11152480`

## Objective

Extend the existing governed GPIR intelligence relay with separate OFAC sanctions-change
and FATF country-classification authorities, preserve append-oriented history, and add
a reader-facing Global Country Risk Monitor without changing the 95% publication
threshold, authentication, entitlements, FX, Payload or Cloudflare contracts.

## Source contracts

### OFAC — `OFAC-US-001`

- Official authority: U.S. Department of the Treasury, Office of Foreign Assets Control.
- Registry landing page: <https://ofac.treasury.gov/sanctions-list-service>.
- Current full files:
  - `https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/SDN.XML`
  - `https://sanctionslistservice.ofac.treas.gov/api/PublicationPreview/exports/CONSOLIDATED.XML`
- Recent actions: <https://ofac.treasury.gov/recent-actions>.
- Published delta addressing:
  `https://sanctionslistservice.ofac.treas.gov/api/download/delta?filename=DeltaArchive%2FYYYY-MM-DD_delta.xml`.
- Parser profile: `ofac-sls-regulatory-v1`; Tier T1; proposed hourly offset minute 5.
- Current full files validate source identity, publication metadata, record count and
  content hash. They are explicitly prohibited as historical listing proof.
- Historical events require a published OFAC delta or recent-action document. Entity
  nationality, address, vessel flag or other country connection is jurisdiction exposure
  only and never a country-sanction conclusion.

### FATF — `FATF-GLOBAL-001`

- Official authority: Financial Action Task Force.
- Registry landing page:
  <https://www.fatf-gafi.org/en/topics/high-risk-and-other-monitored-jurisdictions.html>.
- Publication index:
  <https://www.fatf-gafi.org/en/publications/High-risk-and-other-monitored-jurisdictions.html>.
- Current official statements are discovered from that index and validated on the
  `fatf-gafi.org` origin.
- Parser profile: `fatf-country-classification-v1`; Tier T1; proposed hourly offset
  minute 35.
- `FATF_CALL_FOR_ACTION` and `FATF_INCREASED_MONITORING` are official designations.
  They are never stored as GPIR analytical ratings.
- GPIR High / Medium / Low requires a non-null approved methodology ID. Without that,
  the only allowed value is `UNRATED`.

## Delivered branch implementation

- Additive Supabase evidence tables for regulatory documents, OFAC change events,
  FATF status history and restartable 31-day backfill checkpoints.
- RLS and least-privilege service-role grants; no anonymous table access.
- Controlled `gpir-regulatory-fetch` Edge Function:
  - exact official-host allowlists and redirect validation;
  - SHA-256 content identity and document version preservation;
  - OFAC current snapshot metadata without historical-event conversion;
  - OFAC recent-action and delta parsing with dedupe;
  - bounded one-month OFAC backfill and durable checkpoint counts;
  - FATF current statement parsing and append-oriented current/history transition;
  - existing raw-ingestion and candidate assessment routing;
  - exact timestamps only for 12-hour live eligibility; date-only records archive
    without an invented time;
  - safe rate-limit and failure codes.
- Separately controlled source-registration and rollback SQL. Rollback disables sources
  and schedules without deleting acquired evidence.
- Pure parser/lifecycle regression tests added to the required security workflow.
- Responsive Global Country Risk Monitor:
  - country search, region and FATF category filters;
  - compact table and expandable country profiles;
  - source evidence and status history;
  - contextual ASK GPIR links through the existing governed reader;
  - current snapshot of 21 FATF-classified jurisdictions: 3 call-for-action and
    18 increased-monitoring;
  - 0 GPIR analytical ratings and 0 OFAC jurisdiction conclusions.
- Homepage Risk menu and sitemap route integration.

## Five-year backfill contract

Target range: `2021-11-19` through `2026-11-19`, executed as 60 bounded monthly
windows. Every window records fetched, deduplicated, validated, rejected, unavailable,
earliest and latest verified dates. Re-running a window is idempotent through source
document hashes, event keys and status fingerprints.

OFAC daily delta ingestion is implemented for bounded windows. Official SLS daily delta
availability begins later than the five-year start, so unavailable days remain explicit.
Older official annual change documents may supplement that gap only after a reviewed
parser is added; a current SDN or consolidated snapshot must never fill it.

FATF current ingestion is implemented. Historical FATF execution deliberately fails
closed with `FATF_BACKFILL_REQUIRES_REVIEWED_STATEMENT_MANIFEST` until the five-year
official statement manifest is enumerated and reviewed. This prevents a current list from
being presented as historical status. The milestone cannot be accepted until that manifest,
parser canary and all 60 windows are completed.

## Controlled release order

1. Required branch checks and review.
2. Owner-controlled merge only after the Payload signed-edition implications are reconciled.
3. Apply additive migration.
4. Deploy `gpir-regulatory-fetch`.
5. Run dry-run canaries for OFAC and FATF; verify official redirects, hashes, dates,
   record counts and zero public mutation.
6. Apply source registration and hourly schedules.
7. Verify one genuine eligible update through raw ingestion, candidate validation,
   >=95 publication gate, 12-hour relay and archive.
8. Execute reviewed five-year backfill windows with checkpoint evidence.
9. Produce a new signed Payload site edition including the changed managed homepage
   and new monitor assets; release through the existing GitHub Pages workflow.
10. Perform live desktop/mobile, ASK GPIR, authenticated reader, FX, CMS, payment,
    authentication and entitlement regression acceptance.

No direct main push, automatic merge, production mutation or threshold change is
authorized by this implementation.

## Acceptance state

| Acceptance | State | Evidence / next gate |
|---|---|---|
| OFAC parser and dedupe contracts | IMPLEMENTED / CI PASSED | Security and Integrity run 44482826434 on `d61f7d1` |
| FATF current classifications | STATIC SNAPSHOT IMPLEMENTED / LIVE CANARY PENDING | 21 current jurisdictions sourced to 30 Oct 2026 statements |
| Hourly source polling | PREPARED / NOT APPLIED | Controlled release SQL |
| Independent 12-hour visibility | CODED / NOT PRODUCTION-VERIFIED | Exact timestamp required; date-only remains archived |
| OFAC five-year historical changes | PARTIAL | Bounded delta runner implemented; early official gaps explicit |
| FATF five-year historical status | BLOCKED | Reviewed official statement manifest not yet committed |
| Country filters/cards | IMPLEMENTED / CI PASSED / BROWSER QA PENDING | Structured content, links and JavaScript syntax passed in run 44482826434 |
| ASK GPIR cited responses | ENTRY POINT IMPLEMENTED / LIVE ACCEPTANCE PENDING | Existing governed endpoint; no threshold bypass |
| FX, reader, CMS, auth, entitlements | UNCHANGED IN SOURCE / REGRESSION PENDING | Existing release checks plus live acceptance |
| Production deployment | NOT STARTED | Owner-controlled merge, migration, canaries and signed Payload release |

## Baseline and counts

The pre-existing 2026-11-19 evidence note records 93 approved announcements, only
Sep–Nov 2026 archive coverage, one eligible 12-hour row at query time, and zero
publications from the cited recent ingestion runs. Those are baseline observations,
not evidence of this branch running.

Branch dataset counts:

- FATF Call for Action: 3.
- FATF Increased Monitoring: 18.
- Total current FATF-classified jurisdictions: 21.
- GPIR High / Medium / Low ratings: 0.
- OFAC jurisdiction-sanction conclusions: 0.
- Production OFAC/FATF source rows, documents, events and history created by this
  branch: 0 until controlled deployment.

## Remaining blockers

- Local Windows/Node execution runtime was unavailable, so no local test result is claimed.
  Required GitHub Actions passed on `d61f7d175517261c131400c60161f5dac991407b`:
  Security and Integrity run 44482826434 and PostgreSQL acceptance run 44482826476.
- FATF historical manifest/backfill implementation and canary evidence remain required.
- Supabase migration/function/source schedule are not deployed.
- No genuine update has yet traversed source → relay → publication → archive.
- The new homepage bytes require reconciliation with the signed Payload managed-site
  edition before publication.
- Final production URL, ingestion counts, last successful ingestion and publication
  evidence are unavailable until owner-controlled release and live acceptance.

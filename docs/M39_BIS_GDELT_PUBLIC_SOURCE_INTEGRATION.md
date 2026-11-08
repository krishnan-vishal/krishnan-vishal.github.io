# M39 — BIS and GDELT public-source production closure

## Outcome

M39 reuses the existing GPIR pipeline and public surfaces. It does not create a parallel ingestion or reader stack, change authentication or payments, or change Contentful integration.

- BIS SDMX 2.0 observations are stored as processed statistical-reference raw records. They are available to historical Smart Intelligence readers, but are never classified as event candidates, published as announcements, or placed in the live ticker.
- GDELT DOC 2.0 is a bounded discovery input. Its source registry entry remains AMBER/T3, original publisher URLs are preserved, and the existing GREEN-source publication gate prevents automatic publication.
- PR #520's 36-topic Smart Card taxonomy is integrated into this branch. Contentful editorial normalization remains unchanged and continues to coexist with governed intelligence records.

## Approved BIS coverage

The shared adapter at `supabase/functions/_shared/gpir-public-source-adapters.mjs` is the only flow/query/parser definition used by the Edge Function, command-line helpers, and tests.

| Dataflow | Production slice | Intended use |
| --- | --- | --- |
| `WS_CBPOL` | India, 2026-01 through 2026-10 | Central-bank policy-rate observations |
| `WS_CPMI_CASHLESS` | India, 2023–2024, number / fast-payment filter | Cashless payment statistics |
| `WS_CPMI_SYSTEMS` | India, 2023–2024, card-system / number filter | Payment-system statistics |
| `WS_LBS_D_PUB` | United States, 2025-Q3 through 2026-Q2, bounded aggregate dimensions | Cross-border banking statistics |

Queries use the official BIS SDMX v2 endpoint, `application/vnd.sdmx.data+csv;version=1.0.0`, explicit component filters, explicit time bounds, and bounded observation counts. BIS terms permit reuse with attribution and prohibit misleading presentation; reader records therefore identify BIS, the dataflow, observation period, provider release information when available, source URL, and statistical-reference status.

## Production registration and deployment

- Supabase project: `qlnvhfapctcpzqyuhhth`
- `BIS-GLOBAL-001`: GREEN, tier T1, parser `bis-sdmx-csv-v2`
- `GDELT-GLOBAL-001`: AMBER, tier T3, parser `gdelt-doc-discovery`
- `gpir-intelligence-fetch`: deployed as version 52 with the existing secret-only authorization policy intact
- `gpir-public-intelligence`: deployed as version 7 with its existing public gateway policy intact

Registration and rollback artifacts:

- `supabase/release/m39-bis-gdelt-source-registration.sql`
- `supabase/rollback/m39-bis-gdelt-source-registration.rollback.sql`

The rollback disables the two source entries without deleting ingestion evidence.

## Controlled BIS backfill receipt

The production backfill completed on 2026-11-08 UTC through the approved Supabase connection. It wrote 35 processed raw records with 35 distinct content hashes:

| Dataflow | Rows | Observation range |
| --- | ---: | --- |
| `WS_CBPOL` | 15 | 2026-01 to 2026-10-19 |
| `WS_CPMI_CASHLESS` | 4 | 2023 to 2024 |
| `WS_CPMI_SYSTEMS` | 12 | 2023 to 2024 |
| `WS_LBS_D_PUB` | 4 | 2025-Q3 to 2026-Q2 |

Idempotency was verified by repeating the cashless batch: 4 records were discovered, 0 inserted, and 4 skipped as duplicates. Production verification also returned 0 BIS/GDELT candidates and 0 BIS/GDELT announcements.

## GDELT runtime status

The production adapter is complete and constrained to five configured topics, a maximum seven-day query window, and at most 50 results per request. It records GDELT's seen timestamp as discovery metadata, not as an authoritative publisher timestamp.

The final provider probe from the deployment environment returned HTTP 429 even after respecting the documented inter-request interval. No fabricated or stale discovery records were inserted. GDELT therefore remains registered but AMBER, with zero raw records, until the provider accepts the next scheduled bounded fetch. This is a truthful provider-throttle condition, not a publication or schema failure.

## Public behavior and acceptance

- Historical Smart Intelligence may include normalized BIS statistical-reference records.
- Live and recent modes continue to use only governed announcements.
- Statistical references are ineligible for the homepage ticker.
- The ticker remains empty when there are no genuine eligible announcements in the rolling 12-hour window.
- The 36-topic Smart Card taxonomy and existing related-topic fallback remain intact.
- Existing Contentful editorial items are not mutated by this release.

Local verification:

```text
node tests/m39-bis-sdmx.test.mjs
node tests/m39-public-source-adapters.test.mjs
node --test tests/m39-bis-gdelt-acquisition-contract.test.mjs tests/m39-bis-reader-integration.test.mjs tests/m39-rba-acquisition.test.mjs tests/m39-smart-live-lifecycle.test.mjs tests/m39/smart-intelligence.test.mjs tests/g1/automated-intelligence-publication.test.mjs tests/g1/repository-lifecycle-archive.test.mjs
git diff --check
```

## Official references

- BIS SDMX v2: https://stats.bis.org/api-doc/v2/
- BIS API and permitted use: https://data.bis.org/help/legal
- GDELT DOC 2.0: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/

## Deferred

Crunchbase API and OpenSanctions API remain outside this release because they require separate access and terms review. No keys or accounts are assumed.

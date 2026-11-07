# M39 — Unified live intelligence and historical backfill contract

Owner-approved objectives: continuously acquire approved official/open API evidence; publish eligible fresh events to Global Alerts; derive 36-topic reader intelligence cards; backfill historical repository from 2026-01-01 to present and maintain thereafter.

## Approved architecture and existing implementation boundaries
**Automated alerts lane:** source_registry → gpir-intelligence-fetch → raw staging → gpir_process_raw_record → governed candidates → gpir-intelligence-publish → global_announcements / gpir-public-alerts → Global Alerts ticker and archive. This approved automated path does not require a new Contentful entry for each alert.

**Editorial publication lane:** governed Supabase evidence and publication identity → existing Contentful `gpirPublication` editorial governance → existing M35 Contentful delivery/preview build (`scripts/m35/contentful-delivery-config.js`, `fetch-contentful-publications.js`, `render-contentful-publications.js`) → GitHub Pages publications and reader experience. Preserve the existing Contentful content model, identifiers, editorial access policy and approved publication state. No direct Supabase-to-Contentful write is assumed to exist without code evidence.

**Reader intelligence lane:** `gpir-public-intelligence` historical data + `gpir-public-alerts` current alerts + existing editorial publication feed → `assets/js/smart-intelligence.mjs` reader presentation. Its existing `EDITORIAL_PATH` is `/assets/data/fx/editorial-public.json`, specifically FX editorial material; do not misrepresent that as a general RBA-to-CMS handoff. Verify the relevant governed Contentful publication delivery contract before asserting RBA editorial cards are live.

**Important:** RBA PR #521 changes acquisition only. It does not by itself implement CMS editorial publication, reader card delivery, historical backfill or a successful live alert. Those remain separate acceptance gates within the approved architecture.

Do not add a second ingestion engine, lower T1/T1.5 publication thresholds, elevate T3 discovery providers, or bypass independent original-source verification.

## Processing lanes
1. **Live:** poll each source according to its published update cadence; idempotent source identity and canonical URL dedupe; publish only verified eligible fresh records. Existing Global Alerts 12-hour visibility/retirement remains authoritative.
2. **History:** bounded, resumable per-source backfill with original source-published timestamp, deterministic cursor/checkpoint, and historical classification. No old item should be relabeled as a current alert. Backfill from 2026-01-01 where source licenses and API coverage permit; report gaps explicitly.
3. **Reader:** aggregate only governed published/archived evidence into topic classifications; reuse the existing Contentful editorial delivery path for CMS-managed publications, with source lineage, time range, and data-freshness disclaimers. Do not treat topic cards as independently verified facts. Do not claim all 36 topics are deployed based on the current frontend taxonomy alone.

## Provider roles
- BIS: authoritative structured observations (not news articles); needs mapped dataset/observation identity and observation date before use in topic cards.
- GDELT: discovery and trend candidate only; original article source must be fetched and verified, and GDELT metadata must not be promoted to T1 evidence.
- MAS, ECB, RBA, RBI, SFA: official/approved-source ingestion with verified feed/article parser and publisher checks.
- OpenSanctions, Crunchbase, OpenCorporates: deferred until API access, licensing, privacy, retention and attribution gates are satisfied.

## Acceptance criteria
- Unit and controlled dry-run tests for source-specific canonical URL, date, body evidence, pagination, backfill checkpoints and duplicates.
- Live item eligible only within existing 12-hour alert policy; historical records excluded from ticker.
- Reader cards show provenance and no invented analytics; ASK GPIR references governed records. Existing M35 Contentful editorial delivery must be checked for CMS-managed intelligence, without duplicating CMS entry creation or rerunning RBA source parser tests.
- Existing SFA/RBI/PYMNTS regression tests pass and T3 remains review-only.
- Compare production counts before/after: discovered, raw staged, candidate, review, published, archived, topic-card coverage, failed sources and backfill gaps.
- PR remains draft until real tests, successful canary, and explicit release approval. No payment/auth/entitlement changes.

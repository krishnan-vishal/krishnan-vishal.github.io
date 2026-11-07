# M39 — Unified live intelligence and historical backfill contract

Owner-approved objectives: continuously acquire approved official/open API evidence; publish eligible fresh events to Global Alerts; derive 36-topic reader intelligence cards; backfill historical repository from 2026-01-01 to present and maintain thereafter.

## Existing architecture only
source_registry → gpir-intelligence-fetch → raw staging → gpir_process_raw_record → governed candidates → gpir-intelligence-publish → global_announcements/public archive → Global Alerts / Reader Smart Cards / ASK GPIR.

Do not add a second ingestion engine, lower T1/T1.5 publication thresholds, elevate T3 discovery providers, or bypass independent original-source verification.

## Processing lanes
1. **Live:** poll each source according to its published update cadence; idempotent source identity and canonical URL dedupe; publish only verified eligible fresh records. Existing Global Alerts 12-hour visibility/retirement remains authoritative.
2. **History:** bounded, resumable per-source backfill with original source-published timestamp, deterministic cursor/checkpoint, and historical classification. No old item should be relabeled as a current alert. Backfill from 2026-01-01 where source licenses and API coverage permit; report gaps explicitly.
3. **Reader:** aggregate only governed published/archived evidence into 36 topic classifications; provide source lineage, time range, and data-freshness disclaimers. Do not treat topic cards as independently verified facts.

## Provider roles
- BIS: authoritative structured observations (not news articles); needs mapped dataset/observation identity and observation date before use in topic cards.
- GDELT: discovery and trend candidate only; original article source must be fetched and verified, and GDELT metadata must not be promoted to T1 evidence.
- MAS, ECB, RBA, RBI, SFA: official/approved-source ingestion with verified feed/article parser and publisher checks.
- OpenSanctions, Crunchbase, OpenCorporates: deferred until API access, licensing, privacy, retention and attribution gates are satisfied.

## Acceptance criteria
- Unit and controlled dry-run tests for source-specific canonical URL, date, body evidence, pagination, backfill checkpoints and duplicates.
- Live item eligible only within existing 12-hour alert policy; historical records excluded from ticker.
- Reader cards show provenance and no invented analytics; ASK GPIR references governed records.
- Existing SFA/RBI/PYMNTS regression tests pass and T3 remains review-only.
- Compare production counts before/after: discovered, raw staged, candidate, review, published, archived, topic-card coverage, failed sources and backfill gaps.
- PR remains draft until real tests, successful canary, and explicit release approval. No payment/auth/entitlement changes.

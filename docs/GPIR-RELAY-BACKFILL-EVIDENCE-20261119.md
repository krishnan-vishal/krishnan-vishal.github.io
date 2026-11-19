# GPIR relay and five-year backfill — production evidence and release acceptance
Date: 2026-11-19. Evidence: read-only queries against GPIR browser-configured Supabase project `qlnvhfapctcpzqyuhhth`.

## Observed, not inferred
- `global_announcements`: 93 approved rows, earliest `2026-09-17`, latest `2026-11-19`; 91 ticker-eligible and two not ticker-eligible.
- At query time, **one** approved ticker-eligible announcement had `published_at >= now()-interval '12 hours'`. A zero-result live website must therefore be compared with `gpir-public-alerts` response, expiration and caching.
- `intelligence_ingestion_runs`: 120 successful runs on Nov 18; 73 discovered, 23 candidates, **zero published**. Nov 17: 120 runs, 46 discovered, 33 candidates, zero published. Nov 19 partial day: 32 runs, 20 discovered, 4 candidates, zero published.
- `intelligence_candidates`: 1,029 REVIEW (999 confidence below 95; 30 confidence >=95), 14 APPROVED, one PENDING. Of the 30 high-score REVIEW rows: 24 `AUTO_PUBLICATION_THRESHOLD_NOT_MET`, four `SOURCE_TIMESTAMP_MISSING`, one `INSUFFICIENT_PAYMENTS_RELEVANCE`, one `INSUFFICIENT_SOURCE_EVIDENCE`. **Score alone does not authorize publication.**
- `source_registry`: 14 GREEN, one AMBER (GDELT), three DISABLED. No new external source was activated by this PR.

## Straight-through existing-architecture execution
1. **Relay**: Compare the current approved 12-hour row with `gpir-public-alerts` and frontend consumption. Correct response mapping/cache only if proven defective; preserve 12-hour expiry and archive. Test exactly one eligible row through the public endpoint and homepage/reader displays.
2. **Publication**: Follow existing `gpir-intelligence-fetch` → candidate assessment → `gpir-intelligence-publish` execution and identify the *first failing governing check* for the 24 high-score REVIEW rows. Improve source timestamp/evidence capture where objectively available; never automatically promote REVIEW or reduce the >=95 confidence and source checks.
3. **Backfill**: Freeze canonical GPIR **header-menu and submenu taxonomy** from the approved signed site edition. Use existing source registry, approved feeds and existing ingestion API to request bounded monthly windows for `2021-11-19` through `2026-11-19`. Preserve source date, original URL, provenance, topic IDs, dedupe, rejection reasons and run checkpoint. Do not invent missing source archives.
4. **Coverage**: Per canonical menu topic × year × source, report fetched, candidate, approved, rejected, unavailable and earliest/latest dates. No empty topic may silently disappear. New source candidates require individual source governance/terms approval.
5. **Acceptance**: Live relay 12-hour publication/expiry/archive verified; new genuine item reaches approved publication without manual override; 60 months of backfill windows executed and coverage report signed; both homepage and signed-in ASK return only authorized, topic-relevant evidence. A green ingestion job or a frontend merge is not sufficient.

No database mutations, ingestion trigger, threshold changes or source activations are performed by this evidence note.

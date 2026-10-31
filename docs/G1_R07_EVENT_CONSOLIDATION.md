# G1-R07 — Global event consolidation and source attribution

Status: IMPLEMENTATION SPECIFICATION — not authorized for deployment.
Scope: One controlled PR; retain existing G1 publisher and T3 review-only rules.

## Functional contract
- One canonical event per real-world announcement, independent of reporting URL, headline wording, country, or syndication.
- Canonical event identity must include issuer, event type, subject, effective/announcement date, and affected geography. Similar wording alone must never cause a merge.
- Multiple verified sources must attach to the same event as distinct provenance records with canonical HTTPS URL, publisher, source tier, observed publication time, verification time, and evidence excerpt.
- Social/professional posts from verified organizations may discover an event but cannot independently satisfy automatic publication evidence.
- New coverage of an existing event adds a source link or revision; a materially new milestone is a linked development, not a suppressed duplicate.
- Enriched alert fields: normalized topic keywords, grounded summary, confirmed/pending outcome, implications labeled factual vs analytical, countries/regions/corridors/rails.
- Preserve original authoritative publication time. Aim to discover, verify, and publish eligible alerts within 12 hours. Late verified items go to archive, not current ticker.
- No auto-publication of T3; existing T1/T1.5/T2 confidence thresholds, validation and atomic publication gate remain mandatory.
- Expose only approved records to the public feed; do not disclose private review evidence.

## Safe implementation sequence within this PR
1. Add an additive canonical-events table and event-sources junction with uniqueness constraints, private review controls, and RLS.
2. Extend server-side validation with semantic event identity and source provenance; ambiguous clusters go to REVIEW.
3. Extend atomic publication RPC to enforce single canonical event and attach sources transactionally.
4. Extend approved read-only public response with source links, keywords, summary, outcome, geography, and version metadata.
5. Add deterministic tests: same event different URLs/countries, same headline different events, follow-up milestone, conflicting source facts, T3-only evidence, 12-hour boundary, concurrent publication, historical backfill unchanged.
6. Obtain owner approval before merge, migration, function deployment, or enabling a 200-country monitoring claim.

## Source coverage measurement
Track configured countries, active source monitors, and recent successful ingestion separately. No claim of 200 active countries without evidence.

## Release gates
- Historical backfill reconciled and existing G1 audits preserved.
- All targeted tests pass; no modifications to payments, reader authentication, FX, or existing acquisition function.
- Explicit owner release authorization; rollback plan for new schema and read path.

## Owner refinement — topic-level consolidation (31 October 2026)
The public unit of publication is **one consolidated subject/topic card**, not one card per issuer or news outlet. Validated publications from different entities concerning the same underlying subject must be attached to that card, with publisher-specific links, dates and evidence retained. A card summary must synthesize only verified claims and distinguish announcement, approval, launch and operational milestones with dated updates. Do not collapse contradictory claims: route conflicts and ambiguous subject matches to REVIEW. A different publishing entity is not itself evidence of a distinct event. The earlier issuer-dependent event-key contract is superseded for topic grouping; retain individual source and development identity beneath the topic. No keyword-only or headline-only automatic merging. Existing T3 and validation gates apply to every attached source. This refinement is not yet implemented in the publisher, schema or tests; PR remains Draft until those are updated and verified.

# M33-G1 Processor Semantics Reconciliation

## Status, evidence and scope

This Step 5E record reconciles the four verified Supabase intelligence function
definitions against the Step 5B architecture boundary, Step 5C staging data
contract and Step 5D physical-schema reconciliation.

The definitions were manually collected by the project owner through the
authenticated Supabase SQL Editor. This workspace did not connect to Supabase,
execute a function, execute SQL, read production business rows, expose a
credential, modify schema/data, change runtime code or deploy anything. Step 5E
is documentation and governance only; it does not design or implement corrected
SQL.

## Verified function semantics

### `gpir_rejection_reason(p_title text, p_url text)`

- **Properties:** IMMUTABLE; SECURITY INVOKER.
- **Verified outcomes:** `EMPTY_TITLE`, `HTML_IN_TITLE`,
  `NAVIGATION_OR_STRUCTURAL`, `UTILITY_PAGE`, `INVALID_URL`,
  `TITLE_TOO_SHORT`, otherwise `NULL`.
- **Reconciliation:** this is deterministic Gate 1 junk/structural filtering.
- **Gap status:** `G0`; the Gate 1 function and its processor integration exist.

### `gpir_intelligence_assessment(p_title text, p_url text)`

- **Properties:** IMMUTABLE; SECURITY INVOKER; returns JSONB.
- **Verified signals:** news/publication; PDF/report;
  payments/remittance/cross-border/settlement/acquiring;
  regulation/compliance/AML/KYC/sanctions;
  stablecoin/CBDC/blockchain/digital assets; banking/RTP/open banking/open
  finance; technology/cyber/AI/operational risk; and negative structural/event
  signals.
- **Verified thresholds:** score ≥ 60 → `CANDIDATE`; score 30–59 → `REVIEW`;
  score < 30 → `REJECT`.
- **Verified return fields:** `decision`, `score`, `category`, `event_type`.
- **Reconciliation:** this is the deterministic Gate 2 relevance-assessment
  function, but it is not called by the verified RAW processors.
- **Taxonomy boundary:** its broad categories do not constitute the complete
  extensible 22-family M33-G1 taxonomy or its separate primary/secondary,
  jurisdiction, use-case and payment-rail dimensions.
- **Gap status:** function existence is `G0`; processor integration and taxonomy
  expansion are `G3`.

### `gpir_process_raw_record(p_raw_id uuid)`

- **Properties:** VOLATILE; SECURITY DEFINER; `search_path public`; returns text.
- **Verified input handling:** retrieves the matching
  `intelligence_raw_ingestion` row; returns `NOT_FOUND` if absent; returns
  `ALREADY_PROCESSED` unless the row state is `RAW`.
- **Verified Gate 1 path:** calls `gpir_rejection_reason`. A Gate 1 rejection
  updates RAW state to `REJECTED` and inserts an
  `intelligence_rejection_log` record.
- **Verified survivor path:** inserts directly into `intelligence_candidates`
  with `candidate_status='PENDING'`, `ticker_eligible=false` and
  `validation_notes='Passed deterministic Gate 1; requires intelligence
  validation'`; then marks RAW `PROCESSED` and returns `CANDIDATE`.
- **Verified omission:** it does not call `gpir_intelligence_assessment`.
  Consequently it does not produce Gate-2 `REVIEW`, Gate-2 `REJECT`, or a
  Gate-2-qualified `CANDIDATE` decision.
- **Publication boundary:** no direct write to `global_announcements` was
  observed in the verified definition.
- **Gap status:** Gate 1 processing is `G0`; Gate 2 integration and decision
  routing are `G3`.

### `gpir_process_raw_batch(p_limit integer)`

- **Properties:** VOLATILE; SECURITY DEFINER; `search_path public`; returns
  table (`raw_id uuid`, `processing_result text`).
- **Verified behavior:** selects `RAW` `intelligence_raw_ingestion` records in
  oldest-`discovered_at` order; bounds the requested batch to 1–1000; invokes
  `gpir_process_raw_record(id)`; returns the RAW identity and result.
- **Reconciliation:** it inherits the record processor's Gate 1 behavior, Gate
  2 omission, candidate insertion semantics and lack of direct publication
  write.
- **Gap status:** bounded batch orchestration is `G0`; inherited Gate 2 omission
  is `G3`.

## Verified current processing flow

```text
RAW
 ↓
Gate 1 — gpir_rejection_reason
 ↓
REJECT ──→ RAW=REJECTED + intelligence_rejection_log
   or
PENDING CANDIDATE ──→ intelligence_candidates(ticker_eligible=false)
 ↓
RAW=PROCESSED
 ↓
STOP
```

The current processor treats every Gate 1 survivor as a pending candidate that
requires later intelligence validation. It does not execute Gate 2 and does not
create a canonical handoff or publication record.

## Required future flow

```text
RAW
 ↓
Gate 1
 ↓
Gate 2 — gpir_intelligence_assessment
 ↓
REJECT | REVIEW | CANDIDATE
                    ↓
                VALIDATION
                    ↓
             CANONICAL HANDOFF
                    ↓
          EXISTING M30 PUBLICATION
```

Future implementation must preserve RAW and run lineage, route every Gate 2
decision deterministically, keep REVIEW quarantined, treat CANDIDATE as
validation-only, allow only VALIDATED output to create an idempotent canonical
handoff, and leave final lifecycle/ticker decisions to existing M30 publication
controls.

Step 5E does not specify SQL or authorize implementation of this flow.

## Verified processing gaps

1. Gate 2 exists but is not wired into either RAW processor.
2. REVIEW quarantine is not produced by RAW processing.
3. Gate-2 REJECT is not produced by RAW processing.
4. Gate-2-qualified CANDIDATE is not produced by RAW processing; every Gate 1
   survivor becomes `PENDING` instead.
5. The Gate 2 taxonomy is narrower than the required extensible 22-family
   taxonomy.
6. No canonical-handoff object or processor step is verified, retaining the
   Step 5D `MISSING` classification.
7. The SECURITY DEFINER processors require a controlled change, least-privilege
   review and deterministic regression evidence before any deployment.
8. Batch processing inherits every record-processor omission.

## Gap classification

### G0 — No gap

- Gate 1 rejection function exists and is integrated into RAW processing.
- Gate 1 rejection records RAW rejection and the rejection log.
- Gate 1 survivors enter the physically separate candidate table with
  `ticker_eligible=false`.
- Gate 2 assessment function exists with deterministic thresholds and output.
- Batch bounds processing to 1–1000 and delegates to the record processor.
- None of the four verified functions writes directly to
  `global_announcements`.

### G1 — Documentation/mapping only

- This record establishes the actual processor flow and prevents the existence
  of Gate 2 from being mistaken for Gate 2 integration.
- Existing `PENDING` means a Gate 1 survivor awaiting intelligence validation;
  it is not a Gate-2-qualified candidate or publication approval.

### G2 — Retained Step 5D additive schema gaps

- Canonical handoff remains physically `MISSING`.
- RAW/run/assessment lineage, durable RAW traceability, taxonomy dimensions and
  the publication ticker-default gap remain as documented in Step 5D.
- Step 5E adds no schema recommendation beyond the already recorded minimal
  additive approach.

### G3 — Processing/function change

- Integrate `gpir_intelligence_assessment` after Gate 1.
- Route Gate 2 `REJECT` to a reasoned terminal rejection while preserving RAW.
- Route Gate 2 `REVIEW` to a quarantined representation that cannot
  automatically publish.
- Route only Gate 2 `CANDIDATE` to validation eligibility.
- Expand/version Gate 2 classification to cover the 22-family taxonomy and
  independent dimensions without breaking historical evidence.
- Add a controlled validated-to-canonical-handoff step after the missing
  physical handoff is approved.

These are future planning requirements, not Step 5E implementation authority.

### G4 — Architectural conflict requiring owner decision

- Retain the Step 5D classification for the repository-known
  `scraper.js [LEGACY_BASELINE]` direct-publication path. Controlled retirement
  or cutover requires explicit owner approval after the staging processor,
  validation and canonical handoff are ready and regression-proven.

## Boundary result

The four verified Supabase functions do not provide an unsafe direct
RAW-to-`global_announcements` write. Physical candidate/publication separation
is preserved and candidate ticker eligibility defaults false in the record
processor. However, current processing implements only Gate 1; therefore the
full M33-G1 REJECT/REVIEW/CANDIDATE intelligence boundary is not operational.

The separate legacy scraper remains the known direct-publication bypass. Step
5E records but does not change that G4 condition.

## Future implementation-planning constraints

Any later plan must be additive and reuse existing tables/functions where safe;
preserve RAW, rejection and run lineage; specify exact Gate 2 decision routing;
include the 22-family taxonomy without a destructive enum; define an idempotent
canonical handoff; correct publication defaults only through explicit approval;
test SECURITY DEFINER ownership/search-path/permissions; retain Last-Known-Good
publication on failure; and define staged rollout/rollback before retiring the
legacy direct path.

## Step 5E milestone boundary

Step 5E is complete as processor-semantics inspection and reconciliation
documentation. It authorizes no SQL, DDL, function execution/replacement,
schema/data change, workflow, scheduler, publication, ticker, deployment or
legacy-path change.

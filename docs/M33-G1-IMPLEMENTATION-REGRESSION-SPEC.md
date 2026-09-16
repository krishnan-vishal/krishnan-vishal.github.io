# M33-G1 Gate 2 Integration and Canonical Handoff Specification

## Status, authority and non-implementation boundary

This Step 5F document freezes the owner-review implementation and regression
contract for the smallest safe correction to the verified M33-G1 staging
processor. It continues from Step 5E commit
`44cd001e2396409785f72d0146872256f21de17e` on
`work/m33-g1-global-intelligence-engine`.

Step 5F is planning only. It contains no executable SQL, migration, function
replacement, Supabase connection, runtime change, workflow change, publication
change, deployment or legacy cutover. The existing production path and all
existing `global_announcements` rows remain untouched. Step 6A requires a
separate owner authorization.

## Frozen target flow

```text
SOURCE
  -> INGESTION RUN
  -> RAW
  -> Gate 1
  -> Gate 2
  -> REJECT | REVIEW | CANDIDATE
                            -> VALIDATION
                            -> CANONICAL HANDOFF
                            -> EXISTING M30 PUBLICATION
                            -> CURRENT (<24h) | HISTORICAL (>=24h)
```

The staging boundary ends at canonical handoff. `global_announcements` remains
publication-only. RAW, REVIEW and CANDIDATE never publish. Only an explicitly
validated candidate may create a handoff, and the existing M30 controls remain
responsible for acceptance, publication, lifecycle and ticker eligibility.

## Design decisions

1. Retain `source_registry`, `intelligence_raw_ingestion`,
   `intelligence_candidates`, `intelligence_rejection_log`,
   `intelligence_ingestion_runs` and `global_announcements`.
2. Evolve the four existing GPIR functions; do not create a parallel processor.
3. Reuse `intelligence_candidates.candidate_status='REVIEW'` for quarantine.
   A separate review table is not justified by current evidence.
4. Reuse `PENDING` for a Gate-2-qualified candidate awaiting validation.
   `APPROVED` means the existing physical representation of logical
   `VALIDATED`; it still is not publication.
5. Use the existing candidate fields for core classification and add only the
   missing versioned/multi-value dimensions.
6. Introduce one additive canonical-handoff table. It is a durable proposal
   queue/audit record, not a second publication engine.
7. Preserve the current function signatures so existing callers remain
   compatible. Extend returned text values only with documented deterministic
   outcomes.
8. Keep AI optional. The production decision path remains deterministic and
   complete without an AI provider.

## Minimal future database change package

These are proposed Step 6A migration requirements, not Step 5F changes.

### Preflight gates

Before generating or applying DDL, the future migration must capture and
compare the live table constraints, indexes, function definitions, owners,
grants and RLS policy metadata with the Step 5D/5E evidence. It must stop on
drift. It must also count orphaned `source_id` values, null/orphaned RAW links,
duplicate candidate canonical URLs and rows that would violate a new check or
foreign key. No preflight query may mutate data.

### Additive lineage

- Add nullable `ingestion_run_id uuid` to `intelligence_raw_ingestion`, with a
  foreign key to `intelligence_ingestion_runs(id)`. New ingestion must supply
  it; null remains allowed for historical compatibility until an evidence-based
  backfill is separately approved.
- Add a foreign key from `intelligence_ingestion_runs.source_id` to
  `source_registry(source_id)` and from
  `intelligence_raw_ingestion.source_id` to the same registry only after
  preflight proves current values resolve. Use staged validation if needed.
- Add `assessment_id uuid`, `assessment_version text` and
  `assessment_payload jsonb NOT NULL DEFAULT '{}'::jsonb` to both
  `intelligence_candidates` and `intelligence_rejection_log`. New processor
  output must populate the ID and version. The payload retains the exact
  deterministic Gate 2 output and rule evidence; credentials and fetched RAW
  content are forbidden.
- Add `rejection_stage text` to `intelligence_rejection_log`, constrained to
  `GATE1` or `GATE2` for new rows. Existing rows remain compatible until a
  separately reviewed classification/backfill exists.
- Change both downstream RAW foreign keys from `ON DELETE SET NULL` to
  `ON DELETE RESTRICT` only after the preflight resolves existing null/orphan
  cases. No RAW or downstream row is deleted to make the migration pass.

Candidate and rejection records inherit source and run lineage through their
required RAW link. Direct duplicate lineage columns are not added unless
Step 6A proves that query or integrity needs cannot be met through that link.

### Additive taxonomy fields

Add to `intelligence_candidates`:

- `taxonomy_version text`
- `secondary_categories text[] NOT NULL DEFAULT '{}'`
- `use_case text`
- `payment_rail text`

The existing `category` stores the canonical primary family identifier;
`subcategory`, `sector`, `country_code`, `region`, `event_type` and
`confidence_score` retain their current roles. The original `category` key in
Gate 2 output remains as a backward-compatible alias for `primary_category`.
No database enum is introduced, so governed families can be appended without
rewriting historical records.

### Canonical handoff record

Create one additive table, provisionally named
`intelligence_canonical_handoffs`, with this minimum contract:

- `id uuid` primary key
- `candidate_id uuid NOT NULL` referencing `intelligence_candidates(id)` with
  `ON DELETE RESTRICT`
- `handoff_key text NOT NULL UNIQUE`
- `validation_version text NOT NULL`
- `payload jsonb NOT NULL`
- `handoff_status text NOT NULL` constrained to `PENDING`, `ACCEPTED`,
  `REJECTED` or `FAILED`
- `created_at timestamptz NOT NULL`
- `accepted_at timestamptz`, `failed_at timestamptz`, `failure_code text`
- `supersedes_handoff_id uuid` nullable self-reference with
  `ON DELETE RESTRICT`

`handoff_key` is a deterministic digest of candidate identity, validation
version and content fingerprint. The unique constraint makes repeated handoff
creation idempotent. The immutable payload contains only the minimum M30 input:
candidate/source/RAW/run/assessment identities; canonical URL; title; summary
when validated; source publication time; taxonomy; source tier; validation
version/time/evidence; content fingerprint; provenance; and lineage. It does
not contain a publication status, lifecycle classification or ticker grant.

## Gate 2 processor integration

### `gpir_process_raw_record(p_raw_id uuid)`

The future replacement keeps its current signature and executes one database
transaction:

1. Select the RAW row by ID for update. Return `NOT_FOUND` when absent.
2. Return `ALREADY_PROCESSED` unless `ingestion_status='RAW'`.
3. Call `gpir_rejection_reason(raw_title, canonical/discovered URL)`.
4. On Gate 1 rejection, insert a rejection row with
   `rejection_stage='GATE1'`, a namespaced code such as
   `GATE1:HTML_IN_TITLE`, assessment identity/version and RAW lineage; mark RAW
   `REJECTED`; return `REJECT:<code>`.
5. If Gate 1 passes, call
   `gpir_intelligence_assessment(raw_title, canonical/discovered URL)` exactly
   once and validate that `decision`, `score`, `category` and `event_type` have
   expected types and allowed values. Missing/malformed output fails closed as
   `ASSESSMENT_ERROR`; the transaction must not create a candidate or handoff.
6. For Gate 2 `REJECT`, insert a rejection row with
   `rejection_stage='GATE2'`, code `GATE2:LOW_INTELLIGENCE_SCORE`, the score,
   category, event type, taxonomy/rule version and RAW lineage; mark RAW
   `REJECTED`; return `REJECT:GATE2:LOW_INTELLIGENCE_SCORE`.
7. For Gate 2 `REVIEW`, insert into `intelligence_candidates` with status
   `REVIEW`, `ticker_eligible=false`, score/classification/version/lineage and
   an explicit quarantine note; mark RAW `PROCESSED`; return `REVIEW`.
8. For Gate 2 `CANDIDATE`, first enforce canonical URL/fingerprint duplicate
   checks. A duplicate creates a reasoned terminal rejection/audit result,
   preserves RAW, does not mutate the prior candidate and returns `DUPLICATE`.
   A non-duplicate inserts status `PENDING`, `ticker_eligible=false`, all
   required candidate metadata and validation-required notes; marks RAW
   `PROCESSED`; returns `CANDIDATE`.
9. Any write failure rolls back the entire record transaction, leaving the RAW
   record available for a controlled retry and leaving publication unchanged.

No branch of this function receives `INSERT`, `UPDATE` or `DELETE` capability
on `global_announcements` or the handoff table.

### `gpir_process_raw_batch(p_limit integer)`

Retain the signature, oldest-RAW ordering and inclusive clamp to `1..1000`.
Each row delegates to the corrected record processor and returns the exact
result. One record failure is recorded truthfully without broadening the
function's privileges or allowing a fallback publication path. Batch processing
must never call handoff or M30 publication.

## REVIEW quarantine

REVIEW uses `intelligence_candidates` with:

- `candidate_status='REVIEW'`
- `ticker_eligible=false`
- required RAW/source/run/assessment lineage
- score in `confidence_score`
- primary category in `category`
- `event_type`, taxonomy version, secondary categories, use case and rail
- `created_at`, source `published_at` when evidenced and no inferred timestamp
- `validation_notes` describing the unresolved evidence and quarantine reason
- content fingerprint and freshness only when deterministically supported

REVIEW is queryable for human resolution but cannot transition directly to
`APPROVED`, handoff or publication. Resolution creates a new versioned
assessment outcome or a superseding candidate record while retaining the
original review evidence.

## REJECT semantics

Gate is stored separately in `rejection_stage`, while `rejection_code` is
namespaced (`GATE1:<reason>` or `GATE2:LOW_INTELLIGENCE_SCORE`). Gate 2 score,
category, event type, taxonomy version and assessment evidence are retained in
`assessment_payload`. A rejection is terminal for that assessment, never
creates a candidate/handoff, never deletes RAW and never changes publication.

## CANDIDATE and validation semantics

A Gate-2 candidate is staging-only. It retains `raw_ingestion_id`, `source_id`,
canonical URL, title, source-declared `published_at`, score, primary and
secondary taxonomy, event type, validation state, fingerprint, freshness and
validation notes. It begins `PENDING` and ticker-ineligible.

The future deterministic validation step may move `PENDING` through
`VALIDATING` to existing status `APPROVED` only after source, evidence,
identity, relevance, timestamp, duplicate and publication-contract checks pass.
`APPROVED` is the physical equivalent of logical `VALIDATED`; it authorizes
handoff creation only. Validation failure becomes `REJECTED` or `DUPLICATE`
with retained notes and cannot hand off.

## Versioned 22-family taxonomy

Taxonomy version `M33-G1-TAXONOMY-1` contains these canonical families:

`PAYMENTS`, `BANKING`, `REGULATION`, `FINTECH`, `CROSS_BORDER_PAYMENTS`,
`REMITTANCES`, `RTP_A2A`, `CARDS_SCHEMES`, `WALLETS`,
`PSP_MTO_MSB_AGGREGATORS`, `OPEN_BANKING_OPEN_FINANCE`,
`STABLECOINS_DIGITAL_ASSETS`, `CBDC`, `AML_KYC_KYB_SANCTIONS`,
`FRAUD_CYBER_TPRM`, `PAYMENT_INFRASTRUCTURE`, `ISO_20022_MESSAGING`,
`FX_TREASURY_SETTLEMENT`, `MERCHANT_ACQUIRING`, `DIGITAL_IDENTITY`,
`AI_AGENTIC_PAYMENTS`, and `BNPL`.

Classification has one primary family, zero or more secondary families, and
independent jurisdiction/region, use-case and payment-rail dimensions.
Unsupported dimensions are `UNKNOWN`; they are never guessed. Multi-topic
items choose the family with the strongest deterministic evidence as primary
and retain other evidenced families as ordered, de-duplicated secondary tags.

The future SQL package must use a version-controlled declarative rule map,
not an unstructured expansion of scattered conditions. Gate 2 remains
deterministic and preserves the existing `decision`, `score`, `category` and
`event_type` keys. Additional keys are additive. Historical candidates retain
their original taxonomy version and are not silently reclassified. Optional AI
enrichment may propose secondary metadata later but cannot set Gate decisions,
validation, handoff, publication or ticker eligibility.

## End-to-end lineage

The required trace is:

```text
source_registry.source_id
  -> intelligence_ingestion_runs.id
  -> intelligence_raw_ingestion.id
  -> assessment_id + assessment_version
  -> rejection row OR review/candidate row
  -> validation version/result
  -> intelligence_canonical_handoffs.id
  -> existing M30 publication provenance
```

The ingestion run links to its source; RAW links to both. Downstream outcomes
retain a non-null RAW link for all new records and their assessment identity.
The handoff links to only a validated candidate and carries all upstream IDs in
its immutable payload. M30 must retain the handoff/candidate identity in its
existing provenance mechanism before publication acceptance. Existing IDs are
never replaced, and corrected evidence creates an explicitly superseding
record.

## RAW preservation

The minimum control is layered:

1. Change downstream RAW FKs to `ON DELETE RESTRICT` after a non-mutating
   compatibility audit.
2. Revoke RAW `DELETE` from runtime/callable roles; grant only the operations
   required for acquisition and controlled status updates.
3. Treat retention exceptions as owner-governed maintenance outside the
   processor, with a recorded audit and no cascading deletion.
4. Test that rejection, review, candidate, failed handoff and rollback retain
   RAW content and direct lineage.

No destructive backfill, cleanup or deletion is part of the package. A trigger
is not required unless Step 6A proves privileges and constraints cannot enforce
the contract.

## Canonical handoff behavior

A separately callable handoff function may accept only one candidate ID. It
must be `SECURITY INVOKER` where practical, lock/read the candidate, require
status `APPROVED`, require complete validation evidence, compute the deterministic
handoff key and insert the immutable `PENDING` packet with `ON CONFLICT` returning
the existing handoff. REVIEW, PENDING, VALIDATING, REJECTED and DUPLICATE return
`NOT_VALIDATED` without a handoff.

The handoff function cannot write `global_announcements`. An existing-M30
adapter, built and authorized in a later milestone, may read only valid pending
handoffs, rerun M30 publication validation and either accept or reject them.
A failed adapter attempt marks the handoff `FAILED` with a non-secret reason;
the staging evidence and Last-Known-Good public data remain unchanged.

## Publication-default correction

The smallest future correction is:

```text
global_announcements.ticker_eligible DEFAULT false
```

The migration changes only the default and does not update existing rows. M30
must explicitly set `ticker_eligible=true` only after its existing approval and
CURRENT-lifecycle checks. Before adding any stronger status/eligibility check,
Step 6A must audit existing rows for compatibility; such a check is outside the
minimal package unless the evidence proves it safe.

## SECURITY DEFINER safeguards

The two processor functions must:

- set a fixed safe `search_path` and schema-qualify every referenced object;
- avoid dynamic SQL entirely;
- validate UUID/state/limit and all Gate 2 JSON types/values;
- run with an owner role that has only required RAW/candidate/rejection access
  and no mutation privilege on `global_announcements` or handoff;
- revoke `EXECUTE` from `PUBLIC` and grant it only to the verified processing
  role selected during controlled deployment;
- use transaction rollback and fail-closed return/error behavior;
- never expose secret-bearing metadata in returned text or logs; and
- pass privilege, search-path, malformed-output, direct-publication and
  Last-Known-Good regression checks before application.

Role names and current grants were not verified in Step 5D/5E. Step 6A must
inspect them read-only and stop rather than inventing or broadening a role.

## Deterministic regression specification

The machine-readable specification is
`tests/fixtures/m33-g1-regression-cases.json`. It contains 35 required cases.
Every case declares its input class, expected Gate 1 and Gate 2 result, staging
state, publication eligibility, lineage and return/failure result. It is test
data only and is not imported by runtime code.

Coverage groups are:

- T01–T04: Gate 1 structural rejection.
- T05–T15: Gate 2 scoring, taxonomy and three-way routing.
- T16–T22: deduplication, timestamp and taxonomy edge cases.
- T23–T26: record/batch boundaries.
- T27–T32: handoff authorization, idempotency and LKG failure behavior.
- T33–T35: publication boundary and legacy-baseline protection.

Step 6A must create a deterministic, transaction-isolated SQL regression
harness from this fixture. Tests must run against an isolated disposable schema
or transaction and must never use production rows or credentials. Expected
results are future-contract assertions, not claims that the current functions
already pass.

## Controlled three-source canary plan

No source ID is selected in Step 5F. The owner must choose one already verified
source from each class immediately before a separately authorized canary:

1. central bank or regulator;
2. fintech/payments association; and
3. payments/fintech publication or ecosystem source.

The sequence is deliberately gated:

1. **Dry run:** confirm definitions, grants, source approval and expected URLs;
   perform no writes.
2. **RAW only:** acquire a bounded sample into RAW with run/source provenance;
   disable processing and inspect exact evidence, hashes and timestamps.
3. **Gate processing:** process only the approved sample; inspect every Gate 1,
   Gate 2 and duplicate result plus RAW retention.
4. **Validation:** validate only explicitly selected candidates; REVIEW and
   REJECT remain quarantined.
5. **Handoff dry run:** build/compare packets without allowing an M30 consumer.
6. **Controlled handoff proof:** create one idempotent handoff and rerun it to
   prove no duplicate.
7. **Publication proof:** after separate owner authorization, allow M30 to
   evaluate at most one handoff and prove no other publication row changes.
8. **Lifecycle proof:** prove CURRENT only with exact <24-hour evidence and
   HISTORICAL retention at >=24 hours without loss from Search/ASK/archive.

Acceptance requires all 35 regressions passing; exactly traceable
source→run→RAW→assessment→outcome→validation→handoff lineage; no RAW loss; no
REVIEW/REJECT handoff; deterministic taxonomy/version; idempotent handoff; no
processor publication grant/write; unchanged pre-existing announcements; and
successful rollback rehearsal.

STOP immediately on schema/function/grant drift, missing provenance, malformed
Gate output, unexpected decision, duplicate side effect, inferred timestamp,
REVIEW/REJECT publication eligibility, RAW mutation/loss, any processor write
to publication, any change to a pre-existing announcement, ticker/lifecycle
regression, privilege expansion, or inability to restore the prior processor.
There is no bulk source activation.

## Rollback plan

Rollback is prepared and rehearsed before application:

1. Version-control exact pre-change function definitions, owners, grants,
   constraints and checksums as non-secret evidence.
2. Apply future DDL/function changes transactionally where PostgreSQL permits;
   stop before processing if verification differs.
3. Keep the legacy production path running and do not schedule the new
   processor during migration.
4. To roll back processing, revoke callable access to the new definitions,
   restore the captured prior processor definitions and grants, and verify their
   checksums and bounded batch behavior.
5. Disable any future handoff consumer. Do not delete the handoff table, added
   columns, RAW, rejection, review, candidate or handoff history.
6. Leave existing `global_announcements` rows and ticker untouched. The safer
   `ticker_eligible=false` default need not be reversed during a processor
   rollback because reversing it would reintroduce the verified risk.
7. Re-run boundary, regression and LKG comparisons before declaring rollback
   complete. Any partial failure remains recorded and production continues on
   the retained legacy baseline.

Rollback is functional restoration, not destructive schema reversal.

## Legacy cutover conditions

`scraper.js` and its workflow remain the Last-Known-Good production baseline.
They are not modified or retired in Step 5F or Step 6A. A future G4 cutover
requires all of the following evidence and explicit owner approval:

- Gate 2 regression PASS;
- 35-case regression PASS;
- three-source canary PASS;
- complete lineage PASS;
- handoff and idempotency PASS;
- controlled M30 publication PASS;
- CURRENT/HISTORICAL lifecycle PASS;
- rollback proof PASS; and
- owner-approved cutover window and monitoring/stop criteria.

No passing condition authorizes automatic retirement.

## Proposed separately authorized implementation sequence

The next safe milestone is **M33-G1 Step 6A — build the version-controlled SQL
migration and isolated deterministic regression harness**. Step 6A may create
reviewable repository artifacts only. It must not connect to or apply changes
to Supabase, modify publication/ticker/workflows, deploy, activate a source or
retire the legacy path. Controlled cloud application and canary stages require
later, separate owner authorizations.

## Step 5F completion boundary

Step 5F is complete when this specification, its non-runtime fixture and the
three master controls are committed and pushed on the named work branch with
all existing deterministic repository guards passing and no protected file
changed. Completion freezes a proposed contract for owner review; it does not
approve Step 6A or any production action.

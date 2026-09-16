# M33-G1 Staging Data Contract

## Status, authority and evidence boundary

This Step 5C contract defines the logical staging model between acquisition and
the canonical handoff described by
`docs/M33-G1-INTELLIGENCE-BOUNDARY.md`. It is design and validation only. It
does not create or alter Supabase objects, execute SQL, use credentials, change
workflows, modify `scraper.js`, publish records, change the ticker, deploy code
or alter the existing M30 publication lifecycle.

The field concepts below are logical requirements, not claims that equivalent
Supabase columns already exist. Physical names, types, constraints, indexes,
RLS policies, triggers and function signatures require verified schema
evidence before implementation. Unsupported detail is marked `UNKNOWN`.

`LOCAL_RUNTIME_DEPENDENCY: NONE`

`SECRET_OR_CREDENTIAL_REQUIREMENT: NONE`

GitHub remains the source of truth for code, validation and governance.
Supabase is the intended cloud data/runtime layer. A local computer and an AI
or coding agent are development tools only and are not runtime dependencies.
Evidence and processing records must never store passwords, API keys, tokens,
service-role values or other credentials.

## Deterministic state machine

```text
RAW
 ↓
PROCESSING
 ↓
REJECT | REVIEW | CANDIDATE

CANDIDATE
 ↓
VALIDATED | FAILED_VALIDATION

VALIDATED
 ↓
CANONICAL_HANDOFF
 ↓
EXISTING M30 PUBLICATION (separate lifecycle)
```

- `REJECT` is terminal for that assessment and requires a deterministic reason.
- `REVIEW` is quarantined and cannot automatically publish.
- `CANDIDATE` is eligible for validation only; it is not approved, published,
  current or ticker eligible.
- Only `VALIDATED` may create a `CANONICAL_HANDOFF`.
- `FAILED_VALIDATION` is terminal for that validation attempt. New evidence or
  a new rule version creates a new traceable assessment/validation attempt.
- `CANONICAL_HANDOFF` does not itself insert into `global_announcements`, alter
  M30 lifecycle state, classify an item as `CURRENT` or `HISTORICAL`, or make an
  item ticker eligible.
- A source, network, parser, processing or validation failure leaves the
  Last-Known-Good public intelligence unchanged.

## A. SOURCE

- **Purpose:** identify an approved source configuration used by acquisition.
- **Identity/key:** a stable registered source identity; the repository
  supports the concept `source_id`, but its physical constraint requires schema
  verification.
- **Required provenance:** owning organization/authority, official source
  origin, approved acquisition endpoint or method, trust/review state and the
  governance evidence that admitted the source.
- **`source_id` relationship:** this is the parent identity referenced by RAW
  evidence, processing runs, assessments and every downstream disposition.
- **Timestamps:** creation/registration and last configuration update; retrieval
  timestamps belong to RAW or run records rather than the source definition.
- **Processing state:** enabled, disabled, review-required or equivalent
  verified states; exact physical values are `UNKNOWN`.
- **Allowed transitions:** governance review may activate, suspend or supersede
  a source without rewriting prior evidence.
- **Immutability expectations:** stable identity and historical provenance are
  append-oriented; configuration changes retain lineage.
- **Deduplication identity:** stable source identity plus verified official
  origin; display name alone is insufficient.
- **Failure behaviour:** source failure records a run/result failure and does
  not delete the source or prior evidence.
- **Publication eligibility:** none. Source registration or successful fetch
  never grants publication or ticker eligibility.

## B. RAW_EVIDENCE

`RAW_PRESERVATION: REQUIRED`

- **Purpose:** preserve the fetched evidence exactly enough to reproduce and
  audit downstream extraction and assessment, including evidence that is later
  rejected.
- **Identity/key:** an immutable RAW evidence identity assigned per received
  evidence item or response unit; physical key and type are `UNKNOWN`.
- **Required provenance:** registered `source_id`, retrieved URL and final URL
  where redirects were accepted, retrieval time, response content/type,
  acquisition method, parser/profile or version, processing-run relationship,
  integrity fingerprint where supported, and downstream disposition reference.
- **`source_id` relationship:** required and must resolve to the registered
  SOURCE that authorized acquisition.
- **Timestamps:** retrieval start/completion or received-at time; source-declared
  publication time remains separate evidence and must not be inferred.
- **Processing state:** `RAW` before processing, then linked to `PROCESSING` and
  a traceable `REJECT`, `REVIEW` or `CANDIDATE` assessment outcome.
- **Allowed transitions:** RAW → PROCESSING → REJECT | REVIEW | CANDIDATE. The
  RAW record itself is retained; state progress is represented by linked run
  and assessment records rather than destructive replacement.
- **Immutability expectations:** fetched payload/evidence and core provenance
  are immutable after capture. Corrections or reparsing create a new versioned
  processing attempt without erasing the original.
- **Deduplication identity:** source identity plus canonical retrieved resource
  identity and content fingerprint where available. URL-only deduplication is
  insufficient when source content can change.
- **Failure behaviour:** partial fetch, unsupported content, parser error or
  downstream rejection remains auditable and cannot delete Last-Known-Good
  public intelligence.
- **Publication eligibility:** none. RAW never implies `approved`, `published`,
  `ticker_eligible` or `candidate`.

RAW provenance must answer: which registered source produced the evidence;
which URL was retrieved; when it was retrieved; which content/type was
received; which acquisition method and parser/profile handled it; which
processing run evaluated it; and which downstream disposition resulted. It
must answer these questions without storing secrets or credentials.

## C. PROCESSING_RUN

- **Purpose:** provide a durable run envelope for acquisition/processing scope,
  versioned rules and aggregate outcome.
- **Identity/key:** immutable processing-run identity; physical key is
  `UNKNOWN`.
- **Required provenance:** initiating mechanism, code/rule version, input source
  scope, RAW evidence references, non-secret configuration version and outcome
  counts/status.
- **`source_id` relationship:** one run may cover one or more registered
  sources; every handled RAW item retains its own required source relationship.
- **Timestamps:** started-at and completed/failed-at times in an unambiguous
  timezone.
- **Processing state:** queued/running/completed/failed or equivalent; physical
  values remain `UNKNOWN`.
- **Allowed transitions:** created → processing → completed or failed. A retry
  is a new linked run, not a rewrite of the prior run.
- **Immutability expectations:** final status, rule/code version, counts and
  failure evidence are append-oriented after completion.
- **Deduplication identity:** run identity; scheduler time alone is not a safe
  key. A retry relationship prevents accidental conflation.
- **Failure behaviour:** retain partial audit evidence, mark failure truthfully
  and leave Last-Known-Good publication unchanged.
- **Publication eligibility:** none. A successful run can produce assessments,
  not publications.

## D. ASSESSMENT

- **Purpose:** record the deterministic evaluation of one RAW evidence item
  under a declared rule/taxonomy version.
- **Identity/key:** immutable assessment identity linked to RAW identity,
  processing-run identity and evaluation version.
- **Required provenance:** source, RAW and run references; rules/taxonomy
  version; extracted facts; confidence/evidence indicators; deduplication
  result; and disposition rationale.
- **`source_id` relationship:** required through the RAW evidence and retained
  directly or by enforceable relationship for auditability.
- **Timestamps:** assessed-at plus any source-declared event/publication time as
  separate evidence.
- **Processing state:** processing, then exactly one of REJECT, REVIEW or
  CANDIDATE.
- **Allowed transitions:** PROCESSING → REJECT | REVIEW | CANDIDATE. Reassessment
  creates a new versioned assessment and preserves the prior outcome.
- **Immutability expectations:** rules, inputs and final disposition cannot be
  silently overwritten.
- **Deduplication identity:** RAW identity plus assessment/rule version; event
  fingerprints support duplicate detection but do not replace provenance.
- **Failure behaviour:** evaluation errors route to a truthful failed/review
  outcome according to an approved rule; they never default to CANDIDATE.
- **Publication eligibility:** none. Assessment may only make a record eligible
  for later validation.

## E. REJECT

- **Purpose:** retain a terminal, explainable negative assessment without
  discarding its RAW evidence.
- **Identity/key:** assessment identity plus required rejection reason; physical
  key is `UNKNOWN`.
- **Required provenance:** SOURCE, RAW, run and assessment references; reason
  code/text; rule version and supporting evidence.
- **`source_id` relationship:** required through the assessed RAW evidence.
- **Timestamps:** rejected-at and assessment time.
- **Processing state:** `REJECT`, terminal for that assessment.
- **Allowed transitions:** none for the assessment. Later corrected/new evidence
  requires a new assessment with lineage.
- **Immutability expectations:** reason and supporting evidence are retained;
  corrections append or supersede explicitly.
- **Deduplication identity:** assessment identity; repeated identical rejection
  signals may be correlated but not erased.
- **Failure behaviour:** missing reason is invalid and must fail closed rather
  than route to REVIEW, CANDIDATE or publication.
- **Publication eligibility:** never. REJECT records must not enter candidate,
  canonical handoff or publication layers.

## F. REVIEW

- **Purpose:** quarantine ambiguous, incomplete, unsupported or policy-sensitive
  assessments for explicit review.
- **Identity/key:** assessment identity and review-case identity where the
  existing schema supports one; physical representation is `UNKNOWN`.
- **Required provenance:** SOURCE, RAW, run and assessment references; review
  reasons; unresolved fields; evidence and rule/taxonomy version.
- **`source_id` relationship:** required through the assessed RAW evidence.
- **Timestamps:** review-opened-at and any reviewed/resolved-at time.
- **Processing state:** `REVIEW` / quarantined; exact physical values are
  `UNKNOWN`.
- **Allowed transitions:** resolution may create a new REJECT or CANDIDATE
  assessment outcome with lineage. REVIEW never transitions directly to
  VALIDATED, canonical handoff or publication.
- **Immutability expectations:** original review reasons and evidence remain
  visible after resolution.
- **Deduplication identity:** assessment identity plus active review identity;
  equivalent open cases may be linked rather than destructively merged.
- **Failure behaviour:** unavailable reviewer, timeout or unresolved ambiguity
  leaves the record quarantined.
- **Publication eligibility:** none. REVIEW cannot automatically publish or
  become ticker eligible.

## G. CANDIDATE

- **Purpose:** represent an assessment eligible to enter deterministic
  validation.
- **Identity/key:** stable candidate identity linked to assessment and RAW
  evidence, with version/lineage when facts change.
- **Required provenance:** SOURCE, RAW, run and assessment references; extracted
  facts; taxonomy; source/event URL; source-declared times; deduplication
  evidence and validation inputs.
- **`source_id` relationship:** required and traceable to the registered SOURCE.
- **Timestamps:** candidate-created-at, evidence retrieval time and distinct
  source-declared publication/effective times where known.
- **Processing state:** `CANDIDATE`, then `VALIDATED` or `FAILED_VALIDATION`.
- **Allowed transitions:** CANDIDATE → VALIDATED | FAILED_VALIDATION. No direct
  transition to publication, CURRENT, HISTORICAL or ticker eligibility.
- **Immutability expectations:** validation inputs and provenance are preserved;
  changed evidence creates a new version with explicit lineage.
- **Deduplication identity:** stable source/event identity using canonical URL,
  source identity and event fingerprint where available; conflicts fail closed.
- **Failure behaviour:** missing mandatory evidence, unresolved duplicates or
  validation errors produce FAILED_VALIDATION or REVIEW according to the
  approved rule, never implicit validation.
- **Publication eligibility:** eligible for validation only. Candidate status is
  not approval or publication.

## H. CANONICAL_HANDOFF

- **Purpose:** produce an immutable, validated transfer packet for the existing
  M30 publication layer without changing that layer.
- **Identity/key:** validated candidate identity plus handoff/version identity;
  physical storage is not confirmed.
- **Required provenance:** SOURCE, RAW, run, assessment and candidate lineage;
  validation result/version/time; canonical identity; verified source evidence;
  taxonomy and deduplication outcome.
- **`source_id` relationship:** required and preserved end to end.
- **Timestamps:** validated-at and handoff-created-at, distinct from source
  publication time and M30 publication/lifecycle timestamps.
- **Processing state:** created only from `VALIDATED`; delivery/acceptance state
  may be recorded if a verified physical contract is later approved.
- **Allowed transitions:** VALIDATED → CANONICAL_HANDOFF. The handoff may be
  accepted or rejected by the existing publication controls, but it does not
  bypass them.
- **Immutability expectations:** submitted packet is immutable and idempotent;
  corrections create a superseding handoff with lineage.
- **Deduplication identity:** canonical record/event identity plus validation
  and handoff version prevents duplicate publication proposals.
- **Failure behaviour:** failed handoff retains validated staging evidence,
  records the failure and leaves Last-Known-Good publication unchanged.
- **Publication eligibility:** eligible to be evaluated by existing M30
  publication controls only. The handoff itself does not publish, assign
  lifecycle state or make a ticker item.

## Global payments-intelligence taxonomy contract

The taxonomy is an extensible, versioned registry rather than a closed database
enum. A record has one `primary category`, zero or more `secondary
categories/tags`, and independent dimensions for `jurisdiction/region`, `use
case` and `payment rail` where known. Unsupported values remain `UNKNOWN`; they
must not be guessed. New governed categories may be appended without rewriting
historical classifications.

Required classification dimensions are: primary category; secondary
categories/tags; jurisdiction/region; use case; payment rail; and an explicit
UNKNOWN value when evidence does not support a classification.

- primary category
- secondary categories/tags
- jurisdiction/region
- use case
- payment rail
- UNKNOWN

Required initial category families:

- Payments
- Banking
- Regulation
- Fintech
- Cross-border Payments
- Remittances
- RTP / A2A
- Cards / Schemes
- Wallets
- PSP / MTO / MSB / Aggregators
- Open Banking / Open Finance
- Stablecoins / Digital Assets
- CBDC
- AML / KYC / KYB / Sanctions
- Fraud / Cyber / TPRM
- Payment Infrastructure
- ISO 20022 / Messaging
- FX / Treasury / Settlement
- Merchant / Acquiring
- Digital Identity
- AI / Agentic Payments
- BNPL

Taxonomy assignment must retain the taxonomy version and evidence behind the
primary category. Secondary tags may add detail but cannot silently override
the primary classification. Jurisdiction/region, use case and payment rail are
separate fields so geographic, functional and infrastructure concepts are not
collapsed into one label.

## Existing Supabase reconciliation

Classification meanings:

- `EXACT`: verified repository evidence demonstrates that the existing object
  satisfies the logical contract.
- `PARTIAL`: repository evidence supports only part of the logical contract.
- `MISSING`: no existing object is identified for the required logical role.
- `PUBLICATION-ONLY`: the object belongs to publication and must not be used as
  acquisition/staging storage.
- `UNKNOWN`: an object name is known from the owner-supplied Step 5C scope, but
  GitHub does not contain enough schema evidence to classify its physical role.

| Logical contract | Existing Supabase object/function | Classification | Repository-supported evidence | Verification disposition |
|---|---|---|---|---|
| SOURCE | `source_registry` | PARTIAL | `scraper.js` reads the object and supports `source_id`, `feed_or_index_url`, acquisition method, official URL and parser-profile concepts. Full DDL is not in GitHub. | SCHEMA VERIFICATION REQUIRED |
| RAW_EVIDENCE | `intelligence_raw_ingestion` | UNKNOWN | Object name is supplied by the Step 5C scope; no prior repository implementation or schema definition was found. | SCHEMA VERIFICATION REQUIRED |
| PROCESSING_RUN | `intelligence_ingestion_runs` | UNKNOWN | Object name is supplied by the Step 5C scope; no prior repository implementation or schema definition was found. | SCHEMA VERIFICATION REQUIRED |
| ASSESSMENT | `gpir_intelligence_assessment` | UNKNOWN | Function name is supplied by the Step 5C scope; signature, behavior and existence are not evidenced in GitHub. | SCHEMA VERIFICATION REQUIRED |
| REJECT | `intelligence_rejection_log`; `gpir_rejection_reason` | UNKNOWN | Object/function names are supplied by the Step 5C scope; fields, reason taxonomy, signature and constraints are not evidenced in GitHub. | SCHEMA VERIFICATION REQUIRED |
| REVIEW | `intelligence_candidates` | UNKNOWN | The object name is supplied by the Step 5C scope, but GitHub does not prove whether or how it represents quarantine/review state. | SCHEMA VERIFICATION REQUIRED |
| CANDIDATE | `intelligence_candidates` | UNKNOWN | The object name is supplied by the Step 5C scope; physical candidate identity, provenance, state and validation constraints are not evidenced in GitHub. | SCHEMA VERIFICATION REQUIRED |
| CANONICAL_HANDOFF | No confirmed staging object | MISSING | Existing M30 repository publication is documented, but no Supabase staging-to-M30 handoff object or signature is evidenced. | SCHEMA VERIFICATION REQUIRED before implementation |
| Existing M30 publication, outside staging | `global_announcements` | PUBLICATION-ONLY | Repository code and project records show reads/writes and supported concepts including unique canonical URL, publication status and ticker eligibility. It is the known publication-layer object, not a RAW or candidate store. | Full schema/RLS/trigger verification is still required; no Step 5C change is authorized |

No mapping is classified `EXACT` because GitHub does not contain sufficient
physical Supabase schema evidence. The function names
`gpir_rejection_reason` and `gpir_intelligence_assessment` remain `UNKNOWN`
until their existence and signatures are verified through a separately
authorized, read-only schema evidence step. Step 5C does not execute that step.

## Failure and Last-Known-Good contract

Every failure is recorded at the narrowest traceable layer. Acquisition failure
belongs to RAW/run evidence; parser and rules failures belong to processing or
assessment; rejection requires a reason; review remains quarantined; candidate
validation failure remains outside publication; handoff failure leaves the
validated staging record available for investigation. No failure path deletes,
downgrades or replaces existing M30 public intelligence.

## Step 5C completion boundary

This contract is complete as a logical design only. It authorizes no DDL, data
migration, Edge Function, workflow, cron, credential use, deployment or
production behavior. The next milestone must first obtain verified, read-only
schema evidence and reconcile actual objects, columns, constraints, indexes,
RLS policies, triggers and function signatures against this contract.

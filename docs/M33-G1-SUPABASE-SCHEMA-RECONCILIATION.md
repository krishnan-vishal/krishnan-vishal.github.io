# M33-G1 Supabase Physical Schema Reconciliation

## Status, evidence and non-mutation boundary

This Step 5D record reconciles the Step 5C logical staging contract against
authoritative metadata manually collected by the project owner from the
authenticated Supabase SQL Editor with read-only PostgreSQL metadata queries.
This workspace did not connect to Supabase, execute SQL, read production
business rows, execute functions, expose credentials, modify schema/data or
deploy anything.

The evidence proves the listed physical names, columns, constraints, indexes,
RLS state, policy-query result and function signatures/properties. Function
implementation semantics remain `UNVERIFIED` because no function body was
supplied or executed. Trigger metadata was not included and remains
`UNVERIFIED` rather than being inferred absent.

Reconciliation statuses are limited to `EXACT`, `PARTIAL`, `MISSING`,
`PUBLICATION-ONLY` and `UNVERIFIED`. Gap levels are:

- `G0`: no gap
- `G1`: documentation or mapping only
- `G2`: small additive schema, index, constraint or default change
- `G3`: processing or function change
- `G4`: architectural conflict requiring owner decision

## Verified table evidence

For every listed table: `RLS enabled; no explicit policies returned by
pg_policies.` This is a factual metadata result only. It is not a security or
insecurity conclusion. Trigger state is `UNVERIFIED` for every table.

### `source_registry`

- **Primary key / index:** `source_registry_pkey(source_id)`.
- **Columns:**
  - `source_id text NOT NULL`
  - `source_name text NOT NULL`
  - `country_iso3 character NOT NULL`
  - `country text NOT NULL`
  - `region_tags text[]`
  - `category text NOT NULL`
  - `trust_tier text NOT NULL`
  - `official_url text`
  - `acquisition_method character NOT NULL`
  - `feed_or_index_url text`
  - `poll_minutes integer DEFAULT 60`
  - `parser_profile text NOT NULL`
  - `source_status text DEFAULT 'GREEN'`
- **Foreign keys / unique / checks:** none supplied beyond the primary key.
- **RLS/policies:** RLS enabled; no explicit policies returned by pg_policies.

### `intelligence_raw_ingestion`

- **Primary key:** `id uuid DEFAULT gen_random_uuid()`.
- **Columns:**
  - `source_id text NOT NULL`
  - `discovered_url text`
  - `canonical_url text`
  - `raw_title text`
  - `raw_content text`
  - `discovered_at timestamptz NOT NULL DEFAULT now()`
  - `source_published_at timestamptz`
  - `http_status integer`
  - `content_hash text`
  - `ingestion_status text NOT NULL DEFAULT 'RAW'`
  - `rejection_reason text`
  - `metadata jsonb NOT NULL DEFAULT '{}'`
  - `created_at timestamptz NOT NULL DEFAULT now()`
- **Check constraint:** `ingestion_status` is limited to `RAW`, `PROCESSED`,
  `REJECTED`, `ERROR`.
- **Indexes:** primary key; `idx_raw_content_hash(content_hash)`;
  `idx_raw_discovered_at(discovered_at DESC)`;
  `idx_raw_source_id(source_id)`.
- **Foreign keys / unique constraints:** none supplied.
- **RLS/policies:** RLS enabled; no explicit policies returned by pg_policies.

### `intelligence_candidates`

- **Primary key:** `id uuid DEFAULT gen_random_uuid()`.
- **Columns:**
  - `raw_ingestion_id uuid`
  - `source_id text NOT NULL`
  - `canonical_url text`
  - `title text NOT NULL`
  - `published_at timestamptz`
  - `summary_narration text`
  - `country_code text`
  - `region text`
  - `sector text`
  - `category text`
  - `subcategory text`
  - `event_type text`
  - `source_tier text`
  - `confidence_score numeric`
  - `candidate_status text NOT NULL DEFAULT 'PENDING'`
  - `ticker_eligible boolean NOT NULL DEFAULT false`
  - `validation_notes text`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `validated_at timestamptz`
  - `content_fingerprint text`
  - `freshness_status text DEFAULT 'UNKNOWN'`
- **Check constraints:** `candidate_status` is limited to `PENDING`,
  `VALIDATING`, `APPROVED`, `REJECTED`, `DUPLICATE`, `REVIEW`;
  `freshness_status` is limited to `LIVE`, `RECENT`, `HISTORICAL`, `FUTURE`,
  `UNKNOWN`.
- **Foreign key:** `raw_ingestion_id` → `intelligence_raw_ingestion(id)` with
  `ON DELETE SET NULL`.
- **Unique/index evidence:** unique `(source_id, canonical_url)` where
  `canonical_url IS NOT NULL`; indexes on `country_code`, `content_fingerprint`,
  `published_at DESC`, `source_id`, `(source_id, published_at DESC)`,
  `candidate_status`, and the primary key.
- **RLS/policies:** RLS enabled; no explicit policies returned by pg_policies.

### `intelligence_rejection_log`

- **Primary key:** `id uuid DEFAULT gen_random_uuid()`.
- **Columns:** `raw_ingestion_id uuid`, `source_id text`, `canonical_url text`,
  `raw_title text`, `rejection_code text NOT NULL`, `rejection_reason text`,
  `rejected_at timestamptz NOT NULL DEFAULT now()`.
- **Foreign key:** `raw_ingestion_id` → `intelligence_raw_ingestion(id)` with
  `ON DELETE SET NULL`.
- **Indexes:** `source_id` and primary key.
- **RLS/policies:** RLS enabled; no explicit policies returned by pg_policies.

### `intelligence_ingestion_runs`

- **Primary key:** `id uuid DEFAULT gen_random_uuid()`.
- **Columns:** `source_id text`, `started_at timestamptz NOT NULL DEFAULT now()`,
  `completed_at timestamptz`, `run_status text NOT NULL DEFAULT 'RUNNING'`,
  `records_discovered integer NOT NULL DEFAULT 0`, `records_candidate integer
  NOT NULL DEFAULT 0`, `records_rejected integer NOT NULL DEFAULT 0`,
  `records_published integer NOT NULL DEFAULT 0`, `error_message text`,
  `metadata jsonb NOT NULL DEFAULT '{}'`.
- **Check constraint:** `run_status` is limited to `RUNNING`, `SUCCESS`,
  `PARTIAL`, `FAILED`.
- **Indexes:** `source_id`, `started_at DESC`, and primary key.
- **Foreign keys:** none supplied.
- **RLS/policies:** RLS enabled; no explicit policies returned by pg_policies.

### `global_announcements`

- **Primary key:** `id uuid DEFAULT gen_random_uuid()`.
- **Columns:** `source_id text`, `title text NOT NULL`, `summary_narration text`,
  `canonical_url text NOT NULL`, `published_at timestamptz DEFAULT now()`,
  `ticker_eligible boolean DEFAULT true`, `topic_headers text[]`,
  `archive_month_year text`, `url text`, `publication_status text DEFAULT
  'review'`.
- **Foreign key:** `source_id` → `source_registry(source_id)`.
- **Unique constraints:** `canonical_url`; `url`.
- **RLS/policies:** RLS enabled; no explicit policies returned by pg_policies.
- **Boundary observation:** `publication_status DEFAULT 'review'` and
  `ticker_eligible DEFAULT true` can make an insert ticker eligible unless the
  writer explicitly overrides the default. This is a verified boundary risk,
  not a Step 5D correction.

## Verified function signatures

None of these functions was executed. Signatures and declared properties are
verified; implementation semantics remain `UNVERIFIED`.

| Function | Arguments | Return | Volatility | Security | High-level evidence |
|---|---|---|---|---|---|
| `public.gpir_intelligence_assessment` | `p_title text`, `p_url text` | `jsonb` | IMMUTABLE | SECURITY INVOKER | Name/signature support assessment intent; output meaning is unverified. |
| `public.gpir_rejection_reason` | `p_title text`, `p_url text` | `text` | IMMUTABLE | SECURITY INVOKER | Name/signature support rejection-reason intent; taxonomy/logic is unverified. |
| `public.gpir_process_raw_record` | `p_raw_id uuid` | `text` | VOLATILE | SECURITY DEFINER | Accepts one RAW identity; mutation path and boundary behavior are unverified. |
| `public.gpir_process_raw_batch` | `p_limit integer` | table (`raw_id uuid`, `processing_result text`) | VOLATILE | SECURITY DEFINER | Supports bounded batch processing; invoked functions and mutations are unverified. |

No additional directly related M33 function was included in the supplied
metadata evidence.

## Logical-to-physical reconciliation

| Logical entity | Physical object | Status | Evidence | Gap | Future minimal action |
|---|---|---|---|---|---|
| SOURCE | `source_registry` | PARTIAL | Stable primary-key identity and source/acquisition configuration exist. | No evidenced created/updated timestamps, configuration lineage or FKs from RAW/run tables. | G2: add only verified missing lineage/timestamp/FK controls after owner approval; reuse this table as the one registry. |
| RAW_EVIDENCE | `intelligence_raw_ingestion` | PARTIAL | RAW URL/title/content, retrieval/publication times, HTTP status, hash, state, reason and JSON metadata are present. | No evidenced run FK, source FK, explicit acquisition/parser fields or database immutability control; downstream FKs permit `SET NULL`. | G2: minimally add/link run/source/provenance and preservation constraints or metadata conventions; do not replace the table. |
| PROCESSING_RUN | `intelligence_ingestion_runs` | PARTIAL | Run identity, source, start/end, constrained status, counts, error and metadata exist. | RAW/candidate/rejection records have no evidenced run relationship; source FK is not evidenced. | G2: add traceable run relationships and source integrity without redesigning the run table. |
| ASSESSMENT | `gpir_intelligence_assessment`; candidate/rejection fields | UNVERIFIED | Function signature is verified; candidate/rejection objects can store outcomes. | Function body, rule version, durable assessment identity and persistence semantics are unverified. | G3: inspect the function definition read-only and then minimally persist assessment/rule lineage if absent. |
| REJECT | `intelligence_rejection_log`; `gpir_rejection_reason` | PARTIAL | Required rejection code, optional reason, time, source/event fields and RAW FK exist; function signature is verified. | `ON DELETE SET NULL` can break permanent RAW traceability; function semantics, source/run/assessment integrity and reason taxonomy are unverified. | G2 for durable lineage/constraints; G3 only if verified function logic needs correction. |
| REVIEW | `intelligence_candidates.candidate_status='REVIEW'` | PARTIAL | A constrained REVIEW state exists in a table separate from publication; candidate ticker default is false. | Processor transition/enforcement and resolution lineage are unverified; no separate review audit identity is evidenced. | G1 document reuse of REVIEW quarantine; G3 only if function inspection shows automatic publication or destructive transition. |
| CANDIDATE | `intelligence_candidates` | PARTIAL | Candidate identity, RAW FK, source/event data, constrained states, validation fields, fingerprint and duplicate-resistant unique index exist separately from publication. | RAW link can be nulled; source/run/assessment FKs/lineage and taxonomy version/secondary tags/use-case/payment-rail fields are not evidenced. | G2: minimally extend lineage and extensible taxonomy dimensions; retain the existing table. |
| CANONICAL_HANDOFF | No verified object | MISSING | No supplied table, view, queue or function signature represents a validated handoff into M30 publication. | Idempotent validated transfer/acceptance record is absent from evidence. | G2/G3: define the smallest additive handoff representation and controlled processing step after function semantics are verified. |

`global_announcements` is classified `PUBLICATION-ONLY`. It is structurally
separate from RAW, REVIEW and CANDIDATE tables and must not substitute for them.
Its publication/ticker defaults and writer behavior require controlled later
correction, not staging-table replacement.

## Special checks A–J

### A. Immutable RAW preservation

`PARTIAL`. `intelligence_raw_ingestion` can store RAW content, title, URLs,
hash, timestamps, response status and metadata after a rejected disposition.
No immutable-update/delete control or trigger evidence was supplied. RAW
preservation is therefore physically possible but not proven enforced.

### B. Rejected evidence traceability

`PARTIAL`. `intelligence_rejection_log.raw_ingestion_id` links rejection to RAW,
but `ON DELETE SET NULL` allows the durable link to disappear if RAW is deleted.
No run or assessment FK is evidenced.

### C. REVIEW quarantine

`PARTIAL`. `intelligence_candidates` has a constrained `REVIEW` state and is
physically separate from `global_announcements`; its `ticker_eligible` default
is false. Processor behavior and review-resolution lineage remain unverified.

### D. CANDIDATE separation

`PARTIAL` with a verified core boundary. Candidates live in a separate table,
default to `PENDING`, and default `ticker_eligible` to false. Candidate approval
must still mean validation eligibility rather than publication; function bodies
are required to prove that operationally.

### E. Processing run lineage

`PARTIAL`. Run history and outcome counts exist, but no RAW, candidate or
rejection column/FK identifies the handling run. The `records_published` count
also requires semantic verification so a run cannot imply publication without
the canonical boundary.

### F. One authoritative source registry

`PARTIAL`, suitable for minimal extension. `source_registry` has a stable text
primary key and the required source/acquisition configuration. The evidence
supports retaining it as the one authoritative registry; downstream source FKs
and configuration lineage are the gaps.

### G. Publication-only `global_announcements`

`PUBLICATION-ONLY`. Its schema contains publication/ticker/archive fields and a
source FK, while RAW, rejection, review/candidate and run state are represented
elsewhere. The combination of `publication_status DEFAULT 'review'` and
`ticker_eligible DEFAULT true` is a publication-boundary risk.

### H. Extensible 22-family taxonomy

`PARTIAL`. Text fields `category`, `subcategory`, `sector`, `event_type`,
geography fields and RAW/run JSON metadata can represent the 22 initial
families without destructive redesign. Candidate evidence lacks explicit
taxonomy version, secondary category/tag collection, use-case and payment-rail
dimensions. Minimal additive fields or a governed metadata convention are
needed.

### I. Canonical handoff

`MISSING`. No verified physical handoff object exists in the supplied evidence.
`global_announcements` is not the staging handoff.

### J. RAW-to-publication processor boundary

`UNVERIFIED`. `gpir_process_raw_record` and `gpir_process_raw_batch` are
VOLATILE SECURITY DEFINER functions, but only their signatures/properties are
verified. The evidence cannot establish whether they write directly from RAW
to `global_announcements` or enforce validation/canonical handoff. The functions
must not be executed to answer this question; a separately authorized read-only
definition inspection is required.

Independently of those function semantics, repository evidence already records
`scraper.js` as a `LEGACY_BASELINE` path that writes discovered source records
directly to `global_announcements` as approved and ticker eligible. Step 5D
does not alter or extend that path.

## Gap register

### G0 — No gap

- All six named tables exist.
- All four named function signatures and declared properties exist.
- RAW content/provenance storage, rejection logging, candidate quarantine,
  candidate/publication separation and run-history foundations physically exist.
- `source_registry` has a stable primary key and can remain the one source
  registry.

### G1 — Documentation/mapping only

- Document the existing `REVIEW` candidate status as the quarantine
  representation.
- Define governed use of existing taxonomy fields and `UNKNOWN` without
  renaming/replacing tables.
- Retain the factual RLS statement: RLS enabled; no explicit policies returned
  by pg_policies. Security adequacy is outside this evidence.

### G2 — Small additive schema/index/constraint/default change

- Add durable source/run/assessment lineage only where verified absent.
- Protect RAW and its rejection/candidate links from losing traceability;
  `ON DELETE SET NULL` requires controlled reconsideration.
- Add taxonomy version/secondary tags/use-case/payment-rail representation or
  an equivalent governed metadata contract.
- Add the minimal canonical-handoff representation.
- Change the `global_announcements.ticker_eligible` default from true only in a
  later approved migration so review rows cannot become ticker eligible by
  omission.

### G3 — Processing/function change

- Inspect the processor function definitions read-only and verify Gate 1/Gate
  2, disposition, validation, handoff and Last-Known-Good behavior.
- If definitions bypass staging/validation or destructively rewrite RAW, prepare
  the smallest controlled function correction; do not execute or replace them
  in Step 5D.

### G4 — Architectural conflict requiring owner decision

- The known legacy `scraper.js` direct-publication path coexists with the
  required staging architecture. Its controlled retirement/cutover requires an
  explicit owner decision after processor semantics and a canonical handoff are
  verified; Step 5D does not change it.

## Verified boundary risks

1. `global_announcements.ticker_eligible` defaults to `true` while
   `publication_status` defaults to `review`; inserts that omit eligibility can
   create review-status rows marked ticker eligible.
2. Candidate and rejection RAW foreign keys use `ON DELETE SET NULL`, so RAW
   deletion can remove the direct evidence link.
3. RAW and downstream tables have no evidenced processing-run relationship.
4. Processor functions are VOLATILE SECURITY DEFINER and their bodies remain
   unverified; RAW → publication compliance cannot be claimed.
5. The repository-known `scraper.js [LEGACY_BASELINE]` bypasses the staging
   boundary and writes discovered records directly to publication with approved
   and ticker-eligible values.
6. RLS is enabled on every supplied table, but no explicit policies were
   returned by pg_policies. No security conclusion is drawn from that fact.

## Step 5D milestone boundary

Step 5D is complete as inspection and reconciliation documentation based on the
owner-supplied verified metadata. It authorizes no DDL, data change, function
execution/replacement, workflow, scheduler, publication, ticker or deployment
change. The next milestone is a separately authorized read-only inspection of
the four function definitions, especially the two processors, to resolve the
remaining G3 boundary question before any migration plan is implemented.

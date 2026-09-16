# M33-G1 Step 6A Build Report

## Status and authority

Step 6A builds the version-controlled implementation package approved by the
Step 5F contract. It does not apply the package, connect to Supabase, use a
credential, change production, deploy, activate a source, create a PR, merge
`main` or retire the legacy scraper.

The package continues from Step 5F commit
`50c6e2f648f99471f1b098de2740fc2d2305f82d` on
`work/m33-g1-global-intelligence-engine`.

## Artifacts

- Forward migration:
  `migrations/m33-g1/m33-g1-gate2-staging.sql`
- Non-destructive rollback:
  `migrations/m33-g1/m33-g1-gate2-staging-rollback.sql`
- Isolated PostgreSQL behavioral harness:
  `migrations/m33-g1/m33-g1-gate2-isolated-regression.sql`
- Offline/static validator:
  `scripts/test-m33-g1-step-6a.js`
- Authoritative input fixture:
  `tests/fixtures/m33-g1-regression-cases.json`

The repository had no migration directory or evidenced Supabase CLI migration
framework. The package therefore uses the isolated `migrations/m33-g1/`
location and does not pretend to be installed, ordered or deployed by an
existing migration system.

## Forward migration implementation

### Preflight and compatibility

The migration begins a transaction and fails closed unless all six verified
relations exist. Before constraints are added, it detects unresolved RAW/run
source identities and orphaned candidate/rejection RAW identities. It does not
repair, delete or rewrite incompatible business rows.

Historical compatibility is retained by making new lineage, assessment,
taxonomy and validation fields nullable. Constant JSON/array defaults are used
only for new additive metadata fields. Existing identifiers and business
content are not replaced.

### Lineage

The package adds:

- nullable `intelligence_raw_ingestion.ingestion_run_id`;
- source→run and source/run→RAW foreign keys after compatibility preflight;
- assessment ID/version/payload on candidates and rejection records;
- Gate 1/Gate 2 rejection-stage distinction; and
- validation version plus versioned taxonomy dimensions on candidates.

Candidate and rejection records remain linked to their existing RAW identity.
Those foreign keys are replaced with `ON DELETE RESTRICT` constraints after
orphan checks. A fail-closed RAW delete trigger provides an additional
append-oriented preservation control. No RAW deletion or cleanup statement is
present.

### Gate 2 and three-way routing

`gpir_process_raw_record(uuid)` retains its signature and now specifies:

1. `NOT_FOUND` and `ALREADY_PROCESSED` guards;
2. existing deterministic Gate 1;
3. namespaced Gate-1 rejection with preserved RAW;
4. exactly one deterministic Gate 2 assessment for each Gate-1 survivor;
5. fail-closed malformed-assessment handling;
6. Gate-2 REJECT to reasoned rejection history;
7. Gate-2 REVIEW to candidate quarantine with ticker eligibility false;
8. Gate-2 CANDIDATE to PENDING validation-only staging with ticker eligibility
   false; and
9. duplicate canonical URL/fingerprint handling without mutation of the prior
   candidate.

The record and batch processors do not reference
`global_announcements`. The batch signature, oldest-first ordering and 1–1000
bound are retained.

### Versioned taxonomy

`gpir_intelligence_assessment(text,text)` remains deterministic, immutable and
security-invoker. The additive JSON result preserves `decision`, `score`,
`category` and `event_type` while adding `primary_category`, ordered secondary
categories, `taxonomy_version`, use case and payment rail.

`M33-G1-TAXONOMY-1` contains all 22 Step 5C canonical families. Unsupported
classification remains `UNKNOWN`. Multi-topic evidence is retained through
secondary categories. The function has no AI, external API, network or local
machine dependency.

### Canonical handoff

`intelligence_canonical_handoffs` is an additive RLS-enabled staging/audit
table with candidate and supersession lineage, a unique deterministic handoff
key, validation version, immutable payload, status and failure evidence.

`gpir_create_canonical_handoff(uuid)` is security-invoker and permits only an
`APPROVED` candidate with validation time/version, complete source/run/RAW/
assessment lineage and staging ticker eligibility false. REVIEW, PENDING and
otherwise unvalidated candidates return `NOT_VALIDATED`. Repeated creation
returns `HANDOFF_EXISTS`. The function has no publication-table reference or
write.

No automatic handoff consumer or M30 publication adapter is created in Step
6A.

### Publication default

The package contains one approved publication-table operation:

```sql
ALTER TABLE public.global_announcements
    ALTER COLUMN ticker_eligible SET DEFAULT false;
```

It changes only the default for future inserts. It contains no insert, update,
delete, truncate or drop operation for `global_announcements`, so existing rows
remain untouched.

### Security

The two mutating processors are SECURITY DEFINER with fixed `pg_catalog`
search paths, schema-qualified objects, bounded inputs, deterministic failure
behavior and no dynamic SQL. PUBLIC execution is revoked for both processors
and the handoff function. PUBLIC RAW delete permission is revoked.

Production role names, owners and grants were not verified in Steps 5D/5E.
The package intentionally emits no guessed `GRANT EXECUTE`. A future controlled
application must inspect current ownership/grants read-only and authorize one
verified least-privilege processing role before enabling execution.

## Regression package

### Offline/static results

`node scripts/test-m33-g1-step-6a.js` performs 414 assertions covering:

- fixture integrity and all T01–T35 required fields/outcomes;
- prohibited announcement mutations;
- prohibited RAW destruction;
- the single allowed ticker-default correction;
- nullable additive lineage and taxonomy fields;
- RAW preservation constraints/trigger;
- Gate 2 REJECT/REVIEW/CANDIDATE routing;
- explicit candidate `ticker_eligible=false`;
- 22 taxonomy families, UNKNOWN and taxonomy version;
- bounded oldest-first batch processing;
- idempotent validated-only handoff;
- fixed search paths, invoker/definer boundaries and no processor dynamic SQL;
- no processor/handoff publication reference;
- revoked PUBLIC execution without invented roles; and
- non-destructive rollback behavior.

Result: `PASS (414 checks)` and fixture coverage `PASS (35/35 cases)`.

### Isolated PostgreSQL harness

The SQL harness covers T01–T35. It requires an explicit
`m33_g1.isolated_test=on` session setting, refuses a database with pre-existing
RAW work, uses one synthetic source/run, verifies processing/routing/taxonomy/
dedupe/timestamp/batch/handoff/LKG behavior and finishes with `ROLLBACK`.

The harness has not been executed in this workspace because `psql`/PostgreSQL
is unavailable. No production connection was used as a substitute.

`BEHAVIORAL SQL TESTS: NOT EXECUTED — ISOLATED POSTGRES REQUIRED`

## Idempotency and repeat-safety review

- Additive columns and indexes use `IF NOT EXISTS`.
- New constraints use catalog guards, `NOT VALID`, compatibility checks and
  explicit validation.
- Existing RAW foreign keys are replaced only when the intended RESTRICT
  constraint is absent; repeat application retains the named replacement.
- New handoff identity is protected by a unique index and `ON CONFLICT DO
  NOTHING`.
- Functions are installed with `CREATE OR REPLACE` and the RAW trigger is
  deliberately replaced by stable name.
- No mass business-row update or historical-content backfill exists.
- The default-only publication change is repeat-safe and does not touch rows.

Operations that cannot be declared production-safe without live evidence are
fail-closed rather than guessed: constraint validation, existing function/
trigger/grant drift, PostgreSQL-version behavior, lock duration and the exact
least-privilege role grants.

## Rollback

The rollback artifact is transactional and non-destructive. It replaces the
record processor, batch processor and handoff creator with fail-closed disabled
definitions and revokes PUBLIC execution. It retains all additive columns,
constraints, RAW/rejection/review/candidate/handoff evidence, the handoff table
and the safer ticker default.

The exact prior production function definitions, owners and grants do not
exist in GitHub. A future controlled application must capture and checksum them
immediately before application. Restoration is permitted only from that
verified capture. Until restoration, the disabled functions prevent new M33
mutation while the unchanged legacy production path remains Last-Known-Good.

## Static and behavioral validation boundary

Passed locally:

- Step 6A static validator and fixture contract;
- Step 5B architecture-boundary guard;
- Step 5C data-contract guard;
- existing content, announcement, intent, publication-pipeline and link
  validators; and
- JavaScript syntax and Git whitespace checks.

Not executed or claimed:

- PostgreSQL parsing/execution of forward, rollback or regression SQL;
- T01–T35 database behavior;
- live schema/function/owner/grant/RLS/trigger drift checks;
- live-row foreign-key and constraint compatibility;
- function concurrency, locking, transaction and performance behavior;
- real role execution/RLS behavior;
- migration or rollback application; and
- Supabase, workflow, M30, ticker, public-site or deployment verification.

## Protected production boundary

The package does not modify `scraper.js`, either protected workflow, canonical
announcement data, ticker code, M30 publication runtime, public pages,
`index.html` or `CNAME`. The legacy scraper remains the Last-Known-Good
production baseline. No automation is activated.

## Step 6A result and next gate

The version-controlled package is **READY FOR OWNER REVIEW** as a build
artifact. It is not ready for production application.

The only next safe milestone is a separately authorized controlled isolated
PostgreSQL execution/test: parse and apply the forward migration to a disposable
schema/database matching the verified baseline, execute T01–T35, execute the
disable rollback, inspect locks/grants/RLS and record exact results. Production
Supabase application remains prohibited until that milestone passes and the
owner separately approves it.

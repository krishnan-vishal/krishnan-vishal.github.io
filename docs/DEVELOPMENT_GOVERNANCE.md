# FINTECHOSIS / GPIR Development Governance

This document governs future autonomous and human development in the
repository. It complements [ARCHITECTURE_GUARDRAIL.md](ARCHITECTURE_GUARDRAIL.md),
[CONTENT_SCHEMA.md](CONTENT_SCHEMA.md), [MASTER_PROJECT_LOG.md](MASTER_PROJECT_LOG.md),
and [GPIR_BACKLOG.md](GPIR_BACKLOG.md).

## Permanent principles

### Rule 1 — Extend Before Replace

Existing architecture must be extended before replacement is considered.

### Rule 2 — Protect Existing Functionality

Working functionality, public URLs, source governance, performance behaviour,
accessibility and reduced-motion support are protected by default.

### Rule 3 — Explicit Authorisation

No existing GPIR functionality may be changed unless explicitly requested or
logically necessary for an authorised requirement. When application code seems
to require modification, stop and explain the necessity before making that
change.

### Rule 4 — Traceability

Every significant implementation has a prompt, objective, outcome, validation
result and entry in the master project log.

### Rule 5 — No Lost Work

Every identified requirement is classified as `COMPLETED`, `ACTIONABLE`,
`IN PROGRESS`, `PARKED`, `BLOCKED` or `SUPERSEDED`, with its reason and next
condition recorded in the backlog.

### Rule 6 — No Fabrication

Do not invent sources, regulatory information, statistics, dates,
implementation results, test results, commit IDs or milestones. Mark missing
information as unavailable in the repository record.

### Rule 7 — Verify Before Claiming Completion

Code or documentation is not complete merely because it was written. Run the
focused validation for the changed surface, record the result and document
known limitations.

### Rule 8 — Historical Preservation

Project records are append-only. Never silently delete or rewrite historical
prompt entries, outcomes or milestones.

### Rule 9 — Scale Safely

Future design must support 200+ countries, thousands of corridors, large
regulatory and source repositories, and large intelligence datasets without
unnecessary duplication. Use existing schemas, templates and performance
triggers first.

### Rule 10 — Zero-Budget Principle

Prefer existing repository capabilities, GitHub-native functionality and
free/open-source tooling. Paid services or APIs require explicit approval.

## Prompt classification

Every future request is classified in the log and, where it creates ongoing
work, in the backlog. Allowed classifications are:

`FIX`, `ENHANCEMENT`, `SCALING`, `ARCHITECTURE`, `DATA`, `CONTENT`,
`INTELLIGENCE`, `READER EXPERIENCE`, `SEARCH`, `PERFORMANCE`, `GOVERNANCE`,
`SECURITY`, `AUTOMATION`.

## No parallel AI implementation without backlog reconciliation

Before any AI coding agent implements a substantial requirement, it must read
`PROJECT_STATUS.md`, `GPIR_BACKLOG.md` and `MASTER_PROJECT_LOG.md`, search for
an existing implementation or equivalent requirement, and determine whether
another agent has already implemented or is implementing it. If overlap
exists, the agent must stop and report the conflict rather than duplicate
functionality.

Work from another AI engine must enter the backlog as `AWAITING SOURCE PROMPT`
until its exact prompt, outcome and changed files are supplied and reconciled.

## Milestone governance

A milestone may be declared only when its objective was implemented, relevant
validation was performed, the outcome is known, limitations are documented and
the repository state is known. Each milestone records an ID, title, date,
objective, delivered work, evidence/validation, commit, impact and remaining
work.

## Agent operating model

Future autonomous development follows this sequence:

```text
READ -> UNDERSTAND -> CHECK PROJECT STATUS -> CHECK BACKLOG
-> CHECK ARCHITECTURE GUARDRAIL -> PLAN -> IMPLEMENT -> TEST -> VERIFY
-> UPDATE MASTER LOG -> UPDATE BACKLOG -> UPDATE PROJECT STATUS
-> COMMIT -> REPORT
```

A future agent must not proceed into application feature development under a
governance-only prompt. AI ingestion, semantic search, country/corridor
engines, automated ticker ingestion, regulatory scraping and similar systems
belong to later backlog stages unless a later prompt explicitly authorises them.

## Required completion report

A material task report must state:

1. Repository state before implementation.
2. Files created, modified and deliberately not modified.
3. Governance/backlog/status impact.
4. Validation and QA results.
5. Commit SHA, or explicitly that no commit was made.
6. Milestone status, actionable items, parked items, blocked items and next
   recommended stage.

The project status page is the current snapshot; the master log is the
chronological record; the backlog is the work register.

## Current development gate

**Current milestone:** M-10 PARTIAL — Scalable GPIR Content Registry Foundation.

**Current objective:** Complete the scalable registry foundation only after
pending external work has been reconciled.

**Next development gate:** Reconcile all known pending work before starting the
next implementation prompt.

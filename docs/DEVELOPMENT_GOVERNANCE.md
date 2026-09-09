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

## Security hardening boundary

Security changes must use GitHub-native, browser-native or open-source controls
and must not introduce paid services, backend infrastructure or false security
claims. Response-header controls unavailable on GitHub Pages must be recorded
as limitations rather than simulated as equivalent controls. Security checks
must be least-privilege, must not publish or rewrite production content, and
must preserve source attribution, validation history and protected URLs.

The repository security gate is defined in
`.github/workflows/security-integrity.yml`. It validates structured content,
internal HTML links, JavaScript syntax and high-confidence secret patterns.
See [SECURITY.md](../SECURITY.md) for the reporting and platform-limitation
statement.

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

## Ticker freshness rule

The Global Announcements ticker may display a verified dataset status and a
repository-provided refresh timestamp, but must not claim continuous or live
ingestion unless an actual automated ingestion system and evidence-backed
timestamp exist. Overflow fixes must remain scoped to the announcement ribbon
and preserve its animation, hover/focus pause, reduced-motion behavior and
responsive layout.

## Current development gate

The current milestone and handoff are maintained in
[PROJECT_STATUS.md](PROJECT_STATUS.md#current-handoff). Historical milestone
records remain in [MASTER_PROJECT_LOG.md](MASTER_PROJECT_LOG.md); open requirements
remain in [GPIR_BACKLOG.md](GPIR_BACKLOG.md). Do not interpret older snapshots as
current approval to implement unrelated work.

## Cloud-first development and handoff SOP

[AGENTS.md](../AGENTS.md) is the primary worker contract. Vishal Krishnan owns GPIR
and gives the objective and final approval. ChatGPT may consolidate the prompt;
Codex, Copilot, Claude, a Codespace, another approved worker or a human may implement
it. None owns project state. The GitHub working branch is the universal handoff;
reviewed main is authoritative production state.

Use an approved cloud environment with Git, Node and GitHub authentication scoped
to the task. No particular IDE, AI provider, Codespace or office computer is
required. Authenticate through the platform's supported flow; never store tokens,
passwords, private keys or private conversation transcripts in the repository.
GitHub CLI is optional. Git and the GitHub web interface remain sufficient.

1. **Start new work:** Fetch origin, inspect `git status --short`, read AGENTS,
   current handoff, backlog and relevant master-log entries. Preserve unrelated
   changes; use a clean checkout if necessary. Confirm no equivalent work is
   already active. Create the owner-requested branch from latest `origin/main`
   with `git switch -c <working-branch> origin/main`. Never develop on main.
2. **Continue work:** Fetch origin, locate the existing branch with
   `git branch -r`, then switch to its tracking branch. For a new checkout use
   `git switch --track origin/<working-branch>`. For an existing clean checkout,
   inspect divergence and use `git pull --ff-only`; stop on divergence and
   reconcile without reset or force-push. Read that branch's handoff, diff and
   recent commits before editing. Do not start a replacement branch for the same
   milestone simply because the worker changed.
3. **Checkpoint and hand off:** Update the current handoff fields below, append
   significant outcomes to the master log and reconcile the backlog. Commit and
   push to the working branch at coherent checkpoints and before a tool/session
   ends. Incomplete work may be explicitly labelled IN PROGRESS on its branch;
   pushing does not approve or publish it. Compare `git rev-parse HEAD` with
   `git ls-remote origin refs/heads/<working-branch>` before reporting a durable
   handoff. Never claim cloud recovery readiness for local-only work.
4. **Submit:** Run only relevant existing deterministic checks plus
   `git diff --check`, review the diff for secrets and unintended scope, record
   results, commit and `git push -u origin <working-branch>`. Create or prepare
   the PR into main using GitHub's UI or approved CLI. Include objective, files,
   validation, limitations and handoff. Record the actual PR link once known.
   Mark READY FOR REVIEW after implementation and local checks, keeping remote
   push, PR and Actions states explicit. Never report pending CI as passed.
5. **Complete:** GitHub Actions must pass; Vishal reviews and authorizes the
   human-controlled merge. Only after merge record COMPLETE, the actual merge
   commit/date and production verification where available. Main follows the
   existing GitHub Pages process. This SOP grants no worker permission to merge.
6. **Recover:** Authenticate in a replacement approved environment, clone
   `https://github.com/krishnan-vishal/krishnan-vishal.github.io.git`, fetch origin,
   locate/switch the working branch and inspect the handoff. Continue from the
   committed state. If a push failed, record the blocker and preserve work in
   the current environment; a local patch/bundle is optional BCP only, not the
   normal operating chain. Restore approved authentication before resuming the
   push; do not work around access controls.

### Minimal handoff format

Use the existing `PROJECT_STATUS.md` current handoff, scoped to the working
branch. Do not create competing tool-specific state files. Capture:

- Milestone ID/name, objective, owner, working branch and base branch/SHA.
- Implementation status; completed work; remaining work and next dependency.
- Architectural/publication constraints and files changed.
- Commands actually run and their results; separate local checks from Actions.
- Latest known implementation commit, remote synchronization state and PR URL.
- Blockers, approval required and production impact.

Use UNKNOWN / NOT RECORDED for missing historical evidence and PENDING for
future actions. A commit cannot include its own SHA; the committing change can
identify its implementation by branch and commit subject, then a later checkpoint
records the SHA without amending history. Git log and PR metadata remain the
exact commit references. Preserve prior master-log entries; append corrections.

### Tool loss and production isolation

Loss of a development tool must not become loss of project state. Codex limits,
Copilot/Claude outages, an expired Codespace, vanished Cloud Shell or unavailable
office PC all use the same replacement-worker recovery sequence above. If all
AI services are unavailable, humans use the same repository instructions and
published GPIR remains operational.

The production chain remains reviewed main -> existing deterministic controls
and GitHub Pages -> `https://fintechoisis.com/`. No hosting, DNS, CNAME, ownership
or production architecture changes are part of this SOP. Keep the last-known-good
publication, permanent historical intelligence, lineage and lifecycle controls.
Never weaken validators, expose secrets, delete history, force-push shared
branches, publish unvalidated intelligence or add an AI/runtime service dependency.
No auto-merge, competing scheduler, paid service or new orchestration framework
is introduced. Repository policy does not claim that uninspected GitHub branch
protection or account settings have been configured.

### Global Announcements production contract

The existing two-hour continuous-intelligence workflow is the sole automated
announcement schedule. It discovers from the approved trusted-source matrix,
records per-source health, applies the deterministic publication gate, regenerates
static reader/search artifacts and pushes changed output only to
`automation/intelligence-candidates`. It never pushes or merges `main`.

Automatic classification is limited to active `VERIFIED_OFFICIAL` Tier-1 primary
sources whose current cycle is healthy and whose item has an official HTTPS URL,
a source publication date, explicit high-confidence payments relevance, complete
canonical fields and no URL/event duplicate. A failure of any rule keeps the item
non-public. Tier-2/Tier-3, association/media, ambiguous, incomplete, stale and
failed-source material remains in review or quarantine. A publication date without
a verified time never receives an inferred time or live-ticker placement.

Published records are append-oriented. Their original source, candidate reference,
retrieval/validation evidence, lifecycle, lineage and permanent detail URL remain
available after 24-hour live retirement. Generated pages use server-rendered content
as the last-known-good reader; browser JavaScript may enhance filters but must not be
the only copy of public intelligence. No AI service, database, external runtime,
secret or second publication path is part of this contract.

Approved source acquisition is configuration-led and ordered: RSS/Atom, official
API, official JSON/XML, official public release index, permitted deterministic HTML
change monitoring, then manual candidate fallback. Adding a source means validating
and appending registry/configuration metadata and an endpoint/parser profile where
needed; it does not authorize a new scheduler or publication system.

Past, present and future share the same record model. Past means retained validated
history/backfill; present means a validated record whose exact timestamp is within
the 24-hour display window; future means only a source-declared effective date,
deadline, consultation, migration or planned launch. Future is never a prediction.
Upstream failure records AMBER/RED/STALE health as appropriate, retries only within
bounded controls, quarantines unsafe output and leaves the last-known-good reader,
archive, Search GPIR and ASK GPIR corpus unchanged.

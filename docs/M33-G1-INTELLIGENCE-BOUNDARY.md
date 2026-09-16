# M33-G1 Intelligence Acquisition and Publication Boundary

## Status and scope

This document is the authoritative Step 5B architecture contract for the
M33-G1 Global Intelligence Engine. Step 5B is a guardrail milestone only. It
does not migrate ingestion, activate a new engine, change production behavior,
change the ticker, modify Supabase, publish announcements, deploy code or add a
schedule.

GitHub remains the source of truth for code, tests and governance. Supabase is
the intended cloud data and runtime layer for the source registry, RAW
evidence, processing state, intelligence records and run history. AI and coding
agents are development tools only; GPIR runtime operation must not depend on
them or on a local development computer.

## Authoritative target flow

```text
SOURCE REGISTRY
    ↓
ACQUISITION
    ↓
RAW EVIDENCE
    ↓
EXTRACT / FILTER / NORMALISE / DEDUPLICATE
    ↓
GATE 1 + GATE 2
    ↓
REJECT | REVIEW | CANDIDATE
                    ↓
                VALIDATE
                    ↓
             CANONICAL HANDOFF
                    ↓
          EXISTING M30 PUBLICATION
               ↓             ↓
          CURRENT <24h    HISTORICAL
               ↓
          COMPACT TICKER
```

The acquisition and staging side ends at `CANONICAL HANDOFF`. The existing M30
publication layer remains authoritative after that handoff. No third parallel
intelligence engine may be introduced.

## State and transition contract

1. **RAW is evidence storage.** Fetched evidence may be retained even when a
   later filter or gate rejects it. RAW retention does not grant candidate,
   validation or publication status.
2. **REJECT is terminal for that evaluated input.** A rejected record must
   never enter the candidate or publication layer.
3. **REVIEW is quarantine.** A review record cannot publish automatically and
   cannot become ticker eligible merely because acquisition succeeded.
4. **CANDIDATE is not publication.** It means that a record is eligible for
   further validation. It does not mean approved, published, current or ticker
   eligible.
5. **VALIDATE precedes canonical handoff.** Validation must establish the
   required source, evidence, identity, relevance, duplication and publication
   controls before an item can reach the existing publication layer.
6. **Publication lifecycle is separate from acquisition.** `CURRENT` ticker
   eligibility and `HISTORICAL` retention are publication decisions. They must
   not be assigned merely because a fetch, extraction or staging operation
   succeeded.

## Publication boundary

Newly discovered or acquired records must not bypass staging by being written
directly to `global_announcements` with `publication_status` set to `approved`
or `ticker_eligible` set to `true`. `global_announcements` is a publication-layer
table, not a scraping dump.

Existing `global_announcements` rows are protected throughout M33-G1
stabilization. The existing M30 canonical publication, lifecycle and
historical-retention behavior is the Last-Known-Good publication layer. Source,
network, parser, validation or processing failures must retain that
Last-Known-Good public intelligence.

## Legacy baseline

The repository contains one known legacy direct-publication path in
`scraper.js`. It writes discovered records to `global_announcements` and assigns
or updates `publication_status: "approved"` and `ticker_eligible: true`. Step 5B
does not modify or describe that path as compliant. It records the exact file
content as `LEGACY_BASELINE` so the guard can distinguish the protected known
condition from a newly introduced violation.

The baseline is temporary stabilization evidence, not permission to copy,
extend or recreate the behavior. Any change to that protected file, or any new
implementation with equivalent direct-publication behavior, must fail the
Step 5B guard until a separately authorized migration safely replaces the
legacy path.

## Deterministic guard

`scripts/validate-m33-g1-boundary.js` is read-only and uses only Node.js built-in
modules. It:

- verifies the exact `scraper.js` legacy fingerprint and classifies it as
  `LEGACY_BASELINE`;
- scans implementation code for a `global_announcements` mutation combined
  with direct approval or ticker eligibility and fails any non-baseline match;
- compares branch and working-tree changes with the branch point from `main`
  and fails if a protected publication surface changed; and
- includes an isolated self-test for legacy classification, unsafe new direct
  publication and safe RAW/staging-only behavior.

The guard does not invoke Supabase, use credentials, access external services,
modify repository data, schedule work or deploy anything.

## Protected Last-Known-Good surfaces

Step 5B leaves the existing scraper, scheduled workflows, canonical
announcement/candidate/registry/source data, generated pages, homepage, ticker
implementation, CNAME, Supabase resources and M30 publication/lifecycle code
unchanged. Later M33-G1 work must preserve these surfaces unless a new,
explicitly authorized milestone defines and validates a safe migration.

# GPIR RED BOOK — Permanent Owner Directives and Protected Accomplishments

**RB-001 | 2026-11-21 | OWNER DIRECTIVE | PROPOSED FOR GOVERNED MERGE**

> **GPIR architecture is sacred. Every successfully accomplished and verified capability is a protected asset. No future development, correction, enhancement, migration, or coding-tool handoff may silently remove, replace, weaken, or regress it.**

## Golden Rule: architecture and accomplishments
1. **Architecture integrity:** Preserve approved system boundaries, hosting/domain, Supabase authority, Payload editorial controls, Contentful BCP, GitHub reviewed releases, URLs, authentication, entitlements, intelligence publication thresholds, provenance, archives, performance and security. Changes require explicit owner authorization and documented impact.
2. **Verified accomplishments:** A successful milestone becomes a protected baseline **only with evidence**. Record capability, acceptance receipt, commit/PR, production receipt if applicable, affected contracts, and recovery reference. Do not conflate implemented, CI-passed, merged, deployed and live-verified.
3. **Append-only governance:** Never delete or rewrite Red Book decisions or historical master-log entries. Supersede with a dated linked entry, retaining the original and explanation. Git history is not an absolute immutable store; branch protections and owner review are additional enforcement controls.
4. **Pre-change gate:** Read this Red Book and the master control documents, identify protected assets and regression risks, constrain scope, run targeted validation, record before/after evidence and rollback, obtain owner approval for any architecture/security/publication/lifecycle change.
5. **Post-change gate:** Record the result in the master log and protected-accomplishment register. A failure or missing production evidence stays PENDING, never PASS. No autonomous merge or production mutation.

## Protected accomplishment register — initial baseline (evidence-scoped)
| ID | Accomplishment | Evidence state | Protection |
| --- | --- | --- | --- |
| PA-001 | GPIR reviewed architecture and existing publication/security contracts | Governed repository instructions; not a claim that every live service was reverified today | Preserve all approved boundaries and existing functionality |
| PA-002 | SEP-01 Gemini/OpenRouter provider selection | PR #631 merged; selection module on main | Preserve approved selection and safe checkpoint policy |
| PA-003 | SEP-01 isolated two-provider coding-runner wiring | PR #632 reported merged; live authenticated worker acceptance pending | Preserve bounded paths, tests, checkpoints and fail-closed recovery |
| PA-004 | Cline interactive local edit | Owner-reported local acceptance PASS; headless integration BLOCKED | Preserve interactive usability; never claim automated routing |
| PA-005 | Aider diagnostic history | Twelve unsuccessful runs; parked | Retain history, avoid blind retries and false PASS |
| PA-006 | Central Command provider snapshot | PR #633 prepared; production verification pending | Do not mark dashboard live-verified until deployed receipt |
| PA-007 | GPIR intelligence source/history and 12-hour live rules | Existing master-log receipts; future genuine live-item lifecycle acceptance pending | Preserve source gates, timestamps, archival and last-known-good |

## Required entry for each future accomplishment
`PA-ID | date | owner decision | feature/architecture boundary | evidence (test/run/commit/PR/live URL) | status (IMPLEMENTED/CI_PASS/MERGED/DEPLOYED/LIVE_VERIFIED) | protected dependencies | regression test | rollback | supersedes (if any)`

## Authority
Owner decisions govern any authorized change. This Red Book complements, and does not silently override, `AGENTS.md`, `docs/DEVELOPMENT_GOVERNANCE.md`, `docs/MASTER_PROJECT_LOG.md`, `docs/PROJECT_STATUS.md`, and approved architecture guardrails.

## 2026-11-22 — GPIR logo visibility

Owner directive. GPIR dashboard headers must render the approved FINTECHOISIS mark legibly against their actual background. Verify the asset loads and the complete mark is visible on desktop and mobile, including on navy headers. Use a light backing when the existing dark mark needs contrast.

## 2026-11-22 — Homepage and Trusted Source Network release candidate

PR #672 implementation checks confirm the direct country profiles rank first for CBUAE, RBI and the Monetary Authority of Singapore, while the existing publication and directory access contracts pass targeted tests. Governed production deployment and authenticated live directory acceptance remain pending.

## PA-008 — M44 deterministic intelligence orchestration release candidate — 2026-11-28

`PA-008 | 2026-11-28 | M44 owner objective | Existing ten-minute publisher is wrapped by pinned LangGraph OSS deterministic stages; the public relay is bounded to the preceding 12 hours; existing FX archive projects a cached read-only snapshot without an LLM, new database or scheduler | tests/m44-phase1-agentic-intelligence.test.mjs; docs/M44-AGENTIC-INTELLIGENCE.md; branch codex/m44-agentic-intelligence | IMPLEMENTED (UNDEPLOYED) | PA-001 and PA-007; 95% threshold; source evidence; permanent history; Payload/Contentful/release/auth/payment controls | six focused M44 tests plus existing validators | supabase/rollback/m44-agentic-intelligence.rollback.sql, preceding Edge revisions and reviewed Pages revert | none`

This entry protects only the tested release-candidate boundary. It does not claim
deployment, live responsiveness, a completed alert lifecycle, country population,
ASK citations or verified production expenditure.

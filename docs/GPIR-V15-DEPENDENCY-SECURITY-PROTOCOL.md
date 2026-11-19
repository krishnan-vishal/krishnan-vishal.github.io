# GPIR v15 — Dependency Security and Independent Release Protocol

Status: approved operational objective; implementation and acceptance tracked separately. Existing architecture and production security gates remain authoritative.

## Operating controls
- Detect: automated daily dependency advisory checks and checks on dependency changes. Retain native machine-readable audit evidence; identify direct advisories separately from inherited findings.
- Assess: identify installed versions, affected execution paths, public input reachability, build-only versus runtime exposure, and available upstream fixes. Unknown exposure is not proof of safety.
- Remediate: prefer compatible official fixes. Never force a breaking downgrade. Test exact versions in isolation, verify security regressions and normal behavior, then integrate across applicable install/build/runtime paths.
- Exceptions: owner approval must identify the exact advisory, scope, mitigation evidence, residual risk and expiry. No blanket suppression. Unknown, critical, expired or unverified findings block an affected release. Preserve raw audit results even when an exception is accepted.
- Release: use the existing GitHub workflows with scope determined by changed files and dependency boundaries. Frontend-only changes retain signed Payload edition verification, protected-engine integrity, interface tests and applicable security gates. CMS changes retain dependency audit, CMS tests, type checks and Worker build. Intelligence changes retain API, authentication, evidence, confidence threshold, deduplication and archival checks. Shared changes receive all applicable checks. Never relabel an affected change as frontend-only to evade a gate.
- Recovery: retain known-good signed editions, release evidence and rollback instructions. Contentful remains unchanged BCP. Supabase identity, entitlements, data governance and PayPal remain unchanged.

## Operational targets
Daily automated discovery; initial triage within 4 working hours for high/critical findings; compatible remediation target within one working day when available; otherwise documented escalation and containment. These are targets, not guarantees or automatic acceptance. Critical reachable exposure requires immediate containment. Unrelated verified services remain operational where safe.

## Current incident: GHSA-fc5q-39xc-vjpf
PR #585 remains the single release vehicle. Both reviewed picomatch versions passed targeted isolated tests and the Worker build. Native audit still reports the advisory. Conditional owner exception expires 2 December 2026; it is not active until exposure coverage is verified. Do not weaken the existing audit or merge until required acceptance is satisfied. M41 remains closed.

## Acceptance of permanent protocol
Demonstrate scheduled detection, advisory deduplication, evidence retention, fail-closed exception tests (including expiry and unrelated findings), correct change-scope routing and unchanged production safeguards. Record actual workflow runs before marking automation operational.

# GPIR Stage 3A/3B — Governed multi-file preparation

## Scope
This change introduces a **disabled**, testable, read-only multi-file manifest and checkpoint-validation contract. It does **not** enable multi-file provider calls, owner submissions, queue dispatch, commits, PR creation, merge, or deployment. The production gateway and existing SEP-01 single-file runner remain unchanged.

## Proposed limits
- Two to three explicitly named, existing files.
- Eligible paths: `docs/*.md` and `assets/css/*.css` within the existing non-sensitive file boundary.
- Each file at most 100,000 bytes; combined at most 300,000 bytes.
- Reject missing files, duplicate paths, traversal, protected directories, invalid repository metadata, malformed instructions, and stale base revisions.
- Bind a canonical SHA-256 plan identifier to owner, base SHA, instruction, paths, file sizes, and blob SHAs.
- Require separate owner approval before any future dispatch, and separate review before any merge or deployment.

## Implementation status
The pure `multifile-governance.mjs` module and its regression tests establish the **policy contract only**. The returned plan is always `enabled:false` and `read_only:true`. Neither the owner gateway nor the coding runner imports or invokes it yet.

## Remaining work before Stage 3 acceptance
1. Integrate the manifest with authenticated Central Command preview and approval, including server-side recomputation and an explicit cost/attempt budget.
2. Implement bounded multi-file provider editing with atomic rollback, provider routing, total output size checks, and strict commit-path verification.
3. Enforce per-file writer locks and remotely verified checkpoint recovery; never trust client-supplied plan IDs alone.
4. Run an owner-approved, disposable two-file acceptance with provider evidence, CI and draft PR.
5. Keep multi-file execution disabled until independent acceptance and owner authorization.

## Existing governance
Do not change Supabase identity/entitlements, Payload/Contentful roles, intelligence confidence thresholds, live-alert retention, source validation, production releases, or protected code. No Copilot activation and no new execution route is enabled by this PR.

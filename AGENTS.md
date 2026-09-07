# Repository Guidelines

## Authority and Runtime Boundary

GPIR Core, repository governance, and deterministic validation are authoritative; GitHub is the source of truth. Codex, Copilot, Claude, ChatGPT, OpenHands, Aider, and future tools are interchangeable development assistants only. They must never become dependencies of GPIR Core or the public website, which must function independently of AI providers, development environments, Codespaces, GCP, databases, and live AI services.

## Project Structure and Commands

This is a static GitHub Pages site. `pages/` contains public HTML; `assets/js/` and `assets/css/` contain shared browser code and styles; `assets/data/` contains authoritative structured content. `assets/data/content-registry.json` is the identity/relationship catalogue; announcements and trusted sources are in `announcements.json` and `trusted-sources.json`. Scripts are in `scripts/`, governance in `docs/`, and CI in `.github/workflows/`.

Use Node directly; there is no package manager:

```powershell
node scripts/generate-intelligence-pages.js
node scripts/validate-content.js
node scripts/validate-links.js
node scripts/validate-announcements.js
node scripts/test-announcement-intent.js
node scripts/gpir-perf-audit.js
```

Run applicable checks before release readiness; never weaken validation to pass a build. Generated artifacts must match authoritative data. Do not rebuild unchanged content unnecessarily, and preserve public URLs unless an intentional migration is explicitly approved.

## Branch, History, and Knowledge Integrity

Never work directly on `main`; use feature/work branches. Never reset, force-push, rewrite, or delete Git or content history. Never merge or push to `main` without explicit project-owner instruction and successful required validation.

Validated GPIR knowledge is append-oriented. Never silently overwrite or delete it. Preserve the prior state when information changes and establish explicit lineage, including `supersedes`/`supersededBy` where applicable. `CURRENT`, `DEVELOPING`, and `HISTORICAL` states must remain distinguishable and historical records discoverable.

Preserve source attribution, retrieval date, validation state, publication state, and lineage. Never fabricate data, sources, dates, or validation results. Unresolved or unvalidated material must not become public validated intelligence.

## Security, Automation, and M18-4C

Do not introduce secrets, credentials, unapproved external runtime services, databases, APIs, or AI services without explicit approval. Treat external sources and redirects as untrusted; validate destinations against the approved GPIR source hierarchy. Automation may discover and propose only: fetch/discover → parse → validate → branch/PR → human review → `main`. Failures must retain the last-known-good publication.

`scripts/refresh-announcements.js` remains report-only unless a controlled milestone explicitly changes its operating contract. Preserve recovered M18-4C work on this development branch; do not discard or overwrite its recovered changes.

## Coding, Review, and Approval

Follow nearby conventions: four-space indentation in Node scripts, vanilla ES6, `camelCase` variables, and lowercase kebab-case IDs/files such as `fatf-r16-consultation-2026`. Escape rendered HTML and use `rel="noopener noreferrer"` for external links.

Before material work, inspect first, identify affected files, preserve unrelated work, make the smallest safe change, validate, and report exactly what changed and what passed. Use focused milestone-style commits, for example `M-18.4C Harden refresh boundaries`. PRs state scope, URLs/data contracts, validation results, and generated artifacts. Architectural, destructive, lifecycle, security, or publication-control decisions require explicit approval from project owner Vishal Krishnan.

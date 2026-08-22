# Contributing to FINTECHOISIS / GPIR

This is a static HTML/CSS/vanilla-JS site with no build step, no
framework, and no CI. Before making a structural change, read:

- **`docs/ARCHITECTURE_GUARDRAIL.md`** — start here. Lists every CORE
  system (mega-menu, ticker, search index, i18n, dashboard gallery,
  intelligence-page generator, sitemap, country-page approach, responsive
  images, the performance-tier engine, reduced-motion, and the raw
  HTML/CSS/JS architecture itself), what depends on it, how to extend it,
  and what must not be replaced without explicit approval.
- `docs/ARCHITECTURE.md` — the content/data/i18n layering in more depth.
- `docs/PERFORMANCE_ARCHITECTURE.md` — the performance-tier engine, lazy
  loading, responsive images, animation budget, and ticker governance in
  full detail.

## The one rule that matters most

Extend existing systems; don't replace working ones. If a change would
touch something listed as CORE in the guardrail doc beyond what its "how
to extend" section describes, stop and get explicit approval first.

## Before committing

Run `node scripts/gpir-perf-audit.js` — a dev-time, advisory-only check
for image sizing, duplicate media, search-index growth, reduced-motion
coverage, and script-loading scope. It always exits 0; read its output.

If you're publishing a new intelligence record, run
`node scripts/generate-intelligence-pages.js` afterward and never
hand-edit a generated `pages/intelligence/*.html` file directly — it
will be overwritten on the next run.

If you add a new page, check `assets/data/search-index.json` — it is
hand-maintained, not generated, and a page missing from it is simply
invisible to search with no error raised.

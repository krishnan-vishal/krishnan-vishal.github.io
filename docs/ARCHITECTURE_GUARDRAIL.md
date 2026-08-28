# GPIR Architecture Guardrail

This guardrail protects the existing FINTECHOISIS / GPIR architecture while
content and intelligence coverage grow. It is an extension policy, not a
rebuild plan.

## Current architecture

- GitHub Pages serves static HTML, CSS, JavaScript and JSON.
- Shared page templates and vanilla JavaScript provide navigation, search,
  ticker, i18n, dashboards, maps and source verification.
- JSON is the content layer; shared engines are the intelligence/presentation
  layer. Generated intelligence pages are build-time artifacts.
- `assets/data/content-registry.json` is the canonical identity and
  relationship catalog; it references existing datasets and does not duplicate
  substantive page content.
- There is no backend, database, public API, live feed, AI ingestion service or
  observability platform today. Documentation must not imply otherwise.

## Change rules

Before changing a shared component, identify its owning layer and inspect its
nearest template, data file and consumer. Prefer the smallest extension that
preserves existing URLs and public behaviour.

### Content and evidence

- Add structured records to the existing JSON model in
  `docs/CONTENT_SCHEMA.md`; do not duplicate content in HTML or JavaScript.
- Use stable IDs and real repository-relative relationships.
- Cite real, verifiable sources. Never fabricate a source, URL, date, quote,
  regulatory fact or market number.
- Keep source trust separate from GPIR content review status.
- Keep pending or high-risk records out of public presentation until human
  review is complete.

### Runtime and delivery

- Preserve the performance-tier engine, reduced-motion support, lazy loading,
  responsive image delivery and page-specific script loading.
- Do not make the search index, map data or other large content payloads global
  page-load dependencies without measured justification.
- Keep component failures isolated so one optional data source cannot take down
  the page.
- Do not load the complete content registry into every page. Consume it at
  build time or through selective/lazy loading only when a measured feature
  requires it.
- Avoid adding a framework, service worker, database, Kafka/event bus or
  server-side search until the thresholds and migration triggers in
  `docs/PERFORMANCE_ARCHITECTURE.md` are met.

### Validation

Run these checks after content or delivery changes:

```text
node scripts/validate-content.js
node scripts/gpir-perf-audit.js
```

The content validator is a blocking integrity check. The performance audit is
advisory and may report existing warnings for manual review.

## Migration triggers

A future backend or search service requires an explicit decision record tied to
measured need, such as search-index growth beyond the documented 3–5 MB range,
client-side search latency becoming problematic on representative devices, or
a real editorial workflow that cannot be represented by reviewed static data.
Until then, static JSON and generated pages remain the authoritative approach.

## Review questions

Every architectural change should answer:

1. Which existing capability does this extend?
2. Which data and evidence contract does it consume or produce?
3. What is the cheapest focused validation for the changed path?
4. What URL, performance, accessibility, reduced-motion or source-governance
   behaviour could regress?

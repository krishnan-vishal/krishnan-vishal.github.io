# GPIR Content & Data Architecture

This is a factual reference for how content, data and presentation are
actually separated on this site today — written as a baseline for future
work, not an aspirational specification. Everything described here exists
and runs; nothing in this document is a stub or a plan.

GPIR is a static site (HTML/CSS/vanilla JS, served by GitHub Pages). There
is no backend, no database and no build step. The separation described
below is achieved entirely through JSON data files fetched at runtime and
a small number of shared JS engines — not through a CMS, a knowledge graph
or an API layer. Where this document doesn't mention a capability (a
database, versioned records, an API, AI ingestion, observability), it's
because that capability doesn't exist here — a future rebuild onto a real
backend would be needed to add it honestly, rather than a client-side
JSON file pretending to be one.

---

## 1. Layers

```
CONTENT (JSON data files)
        │
INTELLIGENCE (verification / trust engines)
        │
PRESENTATION (shared CSS design tokens + reusable page templates)
        │
LANGUAGE (i18n engine + per-language JSON dictionaries)
```

A change to any one layer does not require touching the others. Concretely:

- Adding a new intelligence record does not touch `announcements.js` or any HTML.
- Adding a new language does not touch any JS engine or any HTML.
- Adding a new chapter page reuses the existing chapter template's CSS/JS wholesale.
- Changing a design token in `variables.css` does not touch any content file.

## 2. Content / Data Layer

| File | What it holds |
|---|---|
| `assets/data/announcements.json` | The Global Announcements intelligence records — title, category, country, region, source, summary, GPIR chapter mapping. Adding a record is a JSON edit; the ticker, detail panel and search all pick it up automatically. |
| `assets/data/trusted-sources.json` | The source-trust registry — organisation → official domain(s), tier, country. Used by the trust engine to verify a cited URL actually belongs to the organisation it claims to. |
| `assets/i18n/{lang}.json` (× 15) | One flat key→string dictionary per language, all with identical key sets (validated by key-parity checks whenever new keys are added). |

Each of these is fetched by its own JS engine at page load and never
hand-embedded into HTML — the HTML only carries stable references
(`data-i18n="nav.gpir"`, `data-intel-id="cbuae-payment-token-2026"`) that
the engine resolves at runtime.

## 3. Intelligence & Verification Layer

`assets/js/trust-engine.js` evaluates every announcement's cited source
against the trusted-sources registry (exact/subdomain domain match) plus
basic lookalike-domain heuristics (punycode, IP-literal hosts, non-HTTPS,
brand+"login/verify" keyword patterns, watch-listed TLDs). It is
explicitly **not** a connected threat-intelligence service — it's a small,
hand-maintained allowlist plus pattern checks, and it fails safe: anything
it can't verify resolves to `SOURCE_REQUIRES_VERIFICATION`, never
`SOURCE_VERIFIED` by default.

Two governance rules are load-bearing across this layer and the hourly
refresh Routine that feeds it:

1. **Never fabricate a source, URL, date, or quote.** If a claim can't be
   traced to a real, verifiable primary source, it doesn't get published —
   it's dropped, not queued as a placeholder.
2. **High-risk categories require human review.** Sanctions, bank
   failures, AML enforcement actions, licence revocations, major security
   incidents and major M&A are never auto-published (`GPIR_CLASSIFIED`);
   they're staged as `PENDING_HUMAN_REVIEW`, which the ticker's publish
   filter excludes automatically.

## 4. Presentation Layer

`assets/css/variables.css` holds the design tokens (colour palette,
typography scale, spacing, radii) every other stylesheet builds on. There
is exactly **one** chapter-page template driving all 20 chapter pages, one
country-page template driving all 3 real country pages, and one legal-page
template driving all 5 legal pages — each page is that shared
template populated with its own content, not an independently designed
page. A new chapter or country is authored by copying the template and
filling in content, not by designing a new layout.

## 5. Language Layer

`assets/js/i18n.js` merges the selected language's JSON dictionary on top
of the English one (so any missing key silently falls back to English —
never a raw key or "undefined"), applies translations to every
`[data-i18n]` element, sets `<html lang dir>` (RTL for Arabic/Urdu), and
persists the choice in `localStorage`. Adding a 16th language is one new
JSON file with the same ~177 keys as the other 15 — no JS or HTML changes.

Deep research content (chapter prose, timelines, dashboards) intentionally
stays English-only: the interface chrome is what's translated, not GPIR's
substantive research, which would need actual validated translation work,
not automated conversion.

## 6. What this does and doesn't support today

**Supported without code changes:** a new intelligence record, a new
trusted source, a new translated string, a new language, a new chapter or
country page (via the existing templates).

**Not implemented, and would need real backend work to add honestly:** a
database or knowledge graph, versioned/superseded record history, a public
API, an AI-ingestion pipeline, uptime/error observability, or an editorial
workflow tool. Anything claiming to offer these on top of a static
GitHub Pages site without a backend would not be real.

See `docs/PERFORMANCE_ARCHITECTURE.md` for how delivery/rendering is kept
independent of how much content this layer holds — performance tiers,
lazy loading, responsive images, and the migration triggers that would
justify moving beyond this architecture.

# FINTECHOISIS / GPIR — Architecture Guardrail

**Purpose.** This document exists to stop a future coding agent or developer
from replacing, rewriting, or "modernizing" a system that already works,
simply because a from-scratch version looks cleaner in isolation. Every
component below is CORE: it is live, it is depended on by real pages, and
it must not be replaced without explicit architectural approval from a
human maintainer. Extending a core system is encouraged and expected.
Rebuilding one from zero is not — that decision is not a coding agent's
to make alone.

This is a governance/index document, not a re-explanation of everything.
Where a deeper technical write-up already exists (`docs/ARCHITECTURE.md`
for the content/data/i18n layers, `docs/PERFORMANCE_ARCHITECTURE.md` for
the performance-tier engine, lazy loading, responsive images, animation
budget, and ticker governance), this document points to it instead of
duplicating it. What's new here is the parts those two docs don't cover
as a single list: the mega-menu, the two ticker rails as a UI system (not
just their performance governance), the search index, the dashboard
gallery/lightbox, the intelligence-page generator, sitemap structure, and
the country-page approach, plus a guardrail-level summary of the raw
HTML/CSS/JS architecture itself.

No code, content, or production behaviour changes with this document.

---

## Quick reference — do not replace without approval

| # | Component | Lives in |
|---|---|---|
| 1 | Static HTML architecture | every `*.html` file, no build step |
| 2 | CSS architecture | `assets/css/*.css` |
| 3 | JavaScript architecture | `assets/js/*.js` |
| 4 | GPIR performance-tier system | `assets/js/script.js` (tier detection) — full write-up in `PERFORMANCE_ARCHITECTURE.md` §2 |
| 5 | Reduced-motion implementation | per-stylesheet `@media (prefers-reduced-motion: reduce)` blocks — full write-up in `PERFORMANCE_ARCHITECTURE.md` §5 |
| 6 | Mega-menu architecture (post-remediation) | `assets/js/script.js` (`initializeMegaMenuHoverIntent`), `assets/css/header.css` |
| 7 | Ticker architecture | `assets/js/fx-ticker.js`, `assets/js/announcements.js`, `assets/css/market.css` + `page.css` |
| 8 | Search-index architecture | `assets/data/search-index.json`, `assets/js/content-search.js` |
| 9 | i18n dictionary architecture | `assets/i18n/*.json`, `assets/js/i18n.js` — full write-up in `ARCHITECTURE.md` §5 |
| 10 | Dashboard gallery / lightbox | `index.html#dashboard-gallery`, `assets/js/dashboard-lightbox.js`, `assets/css/dashboard-lightbox.css`, `assets/js/content-protection.js` |
| 11 | Intelligence-page generator | `scripts/generate-intelligence-pages.js` → `pages/intelligence/*.html` |
| 12 | Sitemap structure | `sitemap.xml` (hybrid hand-maintained + generator-synced) |
| 13 | Country-page approach | `pages/countries/*.html` (real pages) + `assets/data/*-countries.json` + `pages/regions/*.html` (directories) |
| 14 | Responsive image approach | `<picture>`/`srcset` convention — full write-up in `PERFORMANCE_ARCHITECTURE.md` §3.3 |

---

## 1. Static HTML architecture

**What it does.** Every URL on the site is a real, literal `.html` file —
there is no router, no templating engine, no server-side include, and no
build step that assembles pages from fragments. "Routing" is the
filesystem.

**Where it lives.** Every `*.html` file under the repo root and `pages/`.
Shared chrome (header, nav, footer, `<head>` boilerplate) is *physically
duplicated* into every page, not included from a single source — a page
is a complete, self-contained file.

**What depends on it.** Everything. Every CSS/JS/data-driven system
listed in this document assumes it is being loaded by a real static HTML
document with no server-side processing beyond GitHub Pages' default
Jekyll pass-through (see §12 for why that pass-through matters).

**How to extend it.** New pages are authored by copying the closest
existing template of the same page *type* (chapter, country, legal,
intelligence, region) and filling in content — never by hand-rolling a
new page structure from a blank file. Relative asset paths must match the
new file's actual directory depth (`../../assets/...` from two levels
deep, `../assets/...` from one) — this is the single most common
authoring mistake in this repo (see the Stage 0 audit's orphaned
`global-payments-landscape.html` finding).

**What must not be duplicated.** Do not introduce a second page-assembly
mechanism (e.g. a client-side template engine, a partial-include library)
alongside the copy-a-template convention. Pick one pattern per page
*type*, not per page.

**What should eventually become data-driven.** The physically-duplicated
header/nav/footer across ~50 files is the single largest latent
maintenance cost in this architecture — a nav-label change today means
editing every page. This is a known, accepted trade-off of staying
build-tool-free, not an oversight.

**What is explicitly deferred.** Introducing a static-site generator or
build step to deduplicate shared chrome is out of scope until a
maintainer explicitly decides the zero-build-step trade-off is no longer
worth it. Do not introduce one unilaterally.

---

## 2. CSS architecture

**What it does.** Design tokens (`variables.css`) plus one stylesheet per
concern (`header.css`, `hero.css`, `market.css`, `chapter-page.css`,
`country-intelligence.css`, `dashboard-lightbox.css`, etc.), loaded via
plain `<link>` tags.

**Where it lives.** `assets/css/*.css`.

**What depends on it.** Every page. Unlike the JS layer (§3), CSS loading
is **not currently scoped per page** — nearly every nested page loads
essentially the same ~26-file stack regardless of whether it uses that
page type's styles, with the sole confirmed exception of
`dashboard-lightbox.css` (loaded only on the ~6 pages that actually use
the lightbox, matching its JS scoping).

**How to extend it.** Add a new concern-scoped file rather than growing
an existing one into an unrelated area, and follow the load order already
established (`variables.css` first, component/page-specific files after)
since cascade order is load-bearing for specificity — the mega-menu fix
in Implementation 01 depended on this exact ordering.

**What must not be duplicated.** Design tokens. Every colour, spacing, and
type value used elsewhere must reference a `variables.css` custom
property, not a hand-typed literal — a literal is a fork of the design
system waiting to drift.

**What should eventually become data-driven / optimized.** CSS loading
being effectively global (not scoped like JS) is a known inefficiency —
a legal page has no reason to load `dashboard.css` or `cards.css`. Scoping
it per page type is a legitimate future performance improvement, but
touching load order sitewide is high-blast-radius and must go through
dedicated performance-governance review (see `PERFORMANCE_ARCHITECTURE.md`
§12), not an incidental change bundled into unrelated work.

**What is explicitly deferred.** CSS bundling/minification, a CSS-in-JS
or utility-class rewrite, and per-page CSS scoping are all deferred.

---

## 3. JavaScript architecture

**What it does.** Vanilla JS, no framework, no bundler. `assets/js/script.js`
is the sitewide entry point: `initializeWebsite()` runs on
`DOMContentLoaded` and calls each feature module through a `safeInit()`
wrapper so one module throwing (e.g. a bad selector on a page missing
that section) never breaks navigation or any other module. Feature-specific
engines (`world-map.js`, `trust-engine.js`, `announcements.js`,
`dashboard-lightbox.js`) are **scoped** — loaded only on the pages that
actually use them (verified by `scripts/gpir-perf-audit.js` check 5).

**Where it lives.** `assets/js/*.js`.

**What depends on it.** Navigation, search, i18n, the ticker, the mega-menu,
the dashboard gallery, content protection, the reading-progress bar — in
effect, every interactive part of every page.

**How to extend it.** New interactive features get their own
`initializeX()` function registered through `safeInit()` in
`initializeWebsite()`, and their own scoped `<script>` tag added only to
the pages that need it — never appended to the global script.js bundle
if it's genuinely page-specific (that's exactly the world-map.js/
trust-engine.js/announcements.js scoping pattern, and `gpir-perf-audit.js`
check 5 will flag a regression if a page-specific script starts loading
sitewide).

**What must not be duplicated.** The `safeInit()` fault-isolation pattern
and the singleton/controller-registry pattern used by the mega-menu (§6)
— a new interactive component with multiple instances (cards, panels,
menus) should reuse that registry pattern rather than inventing a new
one.

**What should eventually become data-driven.** Nothing structural — the
JS layer's role is presentation logic over the data files listed in
`ARCHITECTURE.md`, and that separation is already in place.

**What is explicitly deferred.** Introducing a JS framework (React, Vue,
etc.), a bundler, or TypeScript. This is a deliberate, repeatedly-reaffirmed
choice, not an oversight — see the Stage 0 audit's tech-stack finding.

---

## 4. GPIR performance-tier system

**What it does, where it lives, extension pattern, testing.** Fully
documented in `docs/PERFORMANCE_ARCHITECTURE.md` §2 — device/network-hint-based
tiering that gates world-map complexity, image loading strategy, and
animation budget. Not re-documented here to avoid drift between two
copies of the same spec.

**What depends on it.** The world map (`world-map.js`), the responsive
image pipeline (§14), and the animation-budget rules (§5).

**What must not be duplicated.** Do not invent a second, competing
"is this a slow device" heuristic anywhere else in the codebase — every
tier-aware decision must read the one tier computed by this system.

**What is explicitly deferred.** Server-side/edge tier detection (this is
entirely client-side by necessity, since there is no server).

---

## 5. Reduced-motion implementation

**What it does, where it lives, governance rule.** Fully documented in
`docs/PERFORMANCE_ARCHITECTURE.md` §5 ("Animation budget"). The
governing rule, restated for guardrail purposes: **every continuous
(infinite-loop) CSS animation must ship with a matching
`@media (prefers-reduced-motion: reduce)` override in the same
stylesheet**, and `scripts/gpir-perf-audit.js` check 4 verifies this
automatically (selector-matching heuristic, human review still expected).

**What depends on it.** The FX ticker, the Global Announcements ticker,
the homepage world-map marker pulse, and the hero scroll indicator — every
currently-shipped continuous animation.

**How to extend it.** Any new continuous CSS animation added anywhere in
the codebase must add its reduced-motion override in the same commit, not
as a follow-up.

**What must not be duplicated.** A second, JS-driven "pause if reduced
motion" mechanism running alongside the CSS media-query approach — keep
this CSS-only unless a specific animation genuinely cannot be paused via
`animation-play-state`/`animation: none`.

**What is explicitly deferred.** Nothing — this is considered complete
for the current animation inventory; the open item is discipline (every
*future* animation must comply), not a missing capability today.

---

## 6. Mega-menu architecture (post-remediation)

**What it does.** Desktop/tablet hover-intent dropdown navigation with a
singleton rule (opening one menu instantly closes any other open one),
scroll-away auto-close, Escape-to-close with focus return, and an
edge-guard that keeps the panel on-screen at every viewport width. Below
767px it becomes a static, non-absolutely-positioned accordion instead
(no overflow risk by construction at that breakpoint).

**Where it lives.** `assets/js/script.js` → `initializeMegaMenuHoverIntent()`
(the controller registry, singleton/close logic, and `applyEdgeGuard()`);
`assets/css/header.css` → `.mega-menu` / `.mega-menu--wide` /
`.mega-menu--headed` / `.mega-menu--more` and the `.nav-item-mega`
containing block.

**What depends on it.** Every page's primary navigation.

**How to extend it.** New nav categories reuse the existing
`.nav-item-mega` / `.mega-menu` markup pattern (a trigger + a panel with
one of the existing column-layout variant classes) and register
automatically with the shared controller — do not hand-roll a bespoke
open/close mechanism for a new menu item.

**What must not be duplicated — and why this section exists.**
As of Implementation 01, the on-screen horizontal position of each panel
is set by `applyEdgeGuard()` as a real `left` (px) value, **not** a CSS
`transform`. This was a deliberate fix, not a stylistic choice: `transform`
is paint-only and does not count toward `document.documentElement.scrollWidth`
in this layout, which is exactly why the pre-fix version caused sitewide
horizontal overflow at 768/1024/1440px even though the panel looked
correctly positioned once open. **Do not revert this to a
`left:50%` + `transform:translateX` centering approach** — that
reintroduces the exact bug Implementation 01 fixed, verified via direct
isolation testing (forcing the old shift variable to an extreme value
changed nothing; forcing a real `left` value fixed it instantly). The
guard also re-runs on `window.load` and `document.fonts.ready`, not just
once at setup — that timing was itself part of the original bug (the
panel's centered position depends on final, settled nav-item widths).

**What should eventually become data-driven.** The menu category list
itself (currently one hand-authored `<li class="nav-item-mega">` block
per top-level category, physically duplicated across every page like the
rest of the header) could become a single JSON-driven nav config injected
at runtime — but that would trade a simple, debuggable, view-source-able
structure for a build-time dependency, so it stays a "should eventually"
item, not a "do this next" item.

**What is explicitly deferred.** Nothing further from Implementation 01's
scope; any new mega-menu visual redesign is a design decision, not an
architecture one, and is out of this document's scope.

---

## 7. Ticker architecture

**What it does.** Two independent horizontally-scrolling ribbons:
`#fx-ribbon` (LIVE FX RATES, populated by `fx-ticker.js` from a live rate
API with graceful fallback when the fetch fails) and `#market-ribbon`
(GLOBAL ANNOUNCEMENTS, populated by `announcements.js` from
`assets/data/announcements.json`). Each has its own `@keyframes` animation,
its own pause-on-hover and pause-when-scrolled-off/tab-backgrounded
behaviour (`initializeTickerVisibilityPause()`), and its own reduced-motion
override.

**Where it lives.** `assets/js/fx-ticker.js`, `assets/js/announcements.js`,
`assets/css/market.css` (`#fx-ribbon` rules) and `assets/css/page.css`
(`#market-ribbon` rules) — deliberately **ID-scoped**, not a shared
`.ticker-track` selector, because both files originally used the bare
class and silently collided (see the in-code comments at both files'
`.ticker-track` rules for the incident this fixed).

**What depends on it.** The homepage hero region. `announcements.json`
also independently feeds the search index and the intelligence-page
generator (§11) — the ticker is one of three consumers of that same data
file, not its only purpose.

**How to extend it.** A third ticker rail (if ever needed) must repeat the
ID-scoping pattern — give its `.ticker-track` and `.ticker-card` rules
their own `#new-ribbon-id` prefix in whichever CSS file defines them, never
the bare class alone.

**What must not be duplicated.** The bare `.ticker-track` / `.ticker-card`
selector without an ID prefix — this is the one specific pattern that has
already caused a real, shipped bug once.

**What should eventually become data-driven.** Already is, for content
(`announcements.json`). What's not data-driven: the FX rate list itself
is hand-maintained inside `fx-ticker.js`'s fallback path, not a JSON file
— low priority to change since it's a fallback, not the primary path.

**What is explicitly deferred.** A live-updating (WebSocket/SSE) ticker;
current refresh is page-load-time only, by design for a static, backend-free
site.

---

## 8. Search-index architecture

**What it does.** Client-side full-text search over pre-extracted,
section-level text excerpts (title, breadcrumb location, type badge, plain
text) — no server, no external search service.

**Where it lives.** `assets/data/search-index.json` (data),
`assets/js/content-search.js` (engine + UI: excerpt rendering, breadcrumb,
type badges).

**What depends on it.** The header search UI on every page that loads
`content-search.js` (currently ~48/49 non-empty pages).

**How to extend it.** **There is no generator script for this file** —
unlike `sitemap.xml`'s intelligence-page block (§12) and the intelligence
pages themselves (§11), `search-index.json` is hand-authored. Adding a
new page's content to search means manually adding its section entries to
this JSON file in the same commit as the page itself. This is the single
easiest step to forget when adding new content — check `search-index.json`
whenever a new page is added, since nothing will fail loudly if it's
skipped, the page will simply be invisible to search.

**What must not be duplicated.** A second, competing client-side index or
search UI. If search ever needs real relevance ranking or larger scale,
that's a `PERFORMANCE_ARCHITECTURE.md` §7 "search scalability" migration
decision, not a parallel implementation to build alongside this one.

**What should eventually become data-driven.** The index generation
itself — an authoring-time script that extracts section text from HTML
automatically (mirroring `generate-intelligence-pages.js`'s pattern)
would remove the manual-sync risk above. Flagged as a good future
addition, not built yet.

**What is explicitly deferred.** Server-side search, fuzzy/typo-tolerant
matching, and search analytics.

---

## 9. i18n dictionary architecture

**What it does, where it lives, extension pattern.** Fully documented in
`docs/ARCHITECTURE.md` §5. One flat JSON dictionary per language (15
today) merged over the English baseline at runtime by `assets/js/i18n.js`,
applied to every `[data-i18n]` element, with `localStorage` persistence
and RTL handling for Arabic/Urdu.

**What depends on it.** Every page's UI chrome (nav, footer, buttons,
labels). Deep research content (chapter prose) is deliberately excluded —
see `ARCHITECTURE.md` §5 for why.

**What must not be duplicated.** A second translation mechanism, or
inline hard-coded translated strings anywhere outside the `assets/i18n/`
JSON files.

**What should eventually become data-driven.** Nothing — this is already
the data-driven layer for interface strings.

**What is explicitly deferred.** Machine-translating the deep research
content itself; a CMS-style translation workflow tool.

---

## 10. Dashboard gallery / lightbox

**What it does.** A homepage grid (`#dashboard-gallery`) of real dashboard
screenshot cards (`data-lightbox-src="assets/dashboards/..."`) that open
into a protected full-size overlay on click — "protected" meaning the
image is served through the same content-protection layer as the rest of
the site's proprietary visuals (right-click/drag/save interception),
fixed in an earlier sprint after being found to bypass that protection
when opened raw.

**Where it lives.** Markup: `index.html#dashboard-gallery`. Behaviour:
`assets/js/dashboard-lightbox.js` (scoped-loaded, ~6/49 pages) working
together with `assets/js/content-protection.js`. Styling:
`assets/css/dashboard-lightbox.css`. Assets: `assets/dashboards/*.png`
with responsive `-w480/-w640/-w800` width variants (§14).

**What depends on it.** The homepage hero region and the ~6 pages that
link into specific dashboard images.

**How to extend it.** A new dashboard card is a new
`data-lightbox-src="assets/dashboards/NEW.png"` element using the
existing card markup, plus the image itself with its responsive width
variants generated the same way as the existing set — never a raw
`<img>`/`<a>` pointing straight at a full-resolution PNG outside this
pattern, which is exactly the protection-bypass bug this system already
had and fixed once.

**What must not be duplicated.** A second lightbox/modal implementation
elsewhere in the codebase — if another feature needs an image overlay,
extend this one rather than adding a competing library or hand-rolled
modal.

**What should eventually become data-driven.** The gallery's card list is
hand-authored HTML in `index.html`; a JSON-driven card list (mirroring
the country-registry pattern in §13) is a reasonable future improvement
if the gallery grows significantly, but is not urgent at current scale
(~6 cards).

**What is explicitly deferred.** Nothing structural; this system is
considered complete and correct as-is, distinct from the now-deleted
`pages/dashboards/*.html` stub files (Implementation 02) which were dead
scaffolding unrelated to this working feature — see the Stage 0 audit for
that distinction.

---

## 11. Intelligence-page generator

**What it does.** A dev-time (not runtime) Node script that reads
`assets/data/announcements.json` and, for every record that has actually
reached the public ticker (`GPIR_CLASSIFIED` status, not trust-blocked),
generates a permanent, standalone, crawlable static page at
`pages/intelligence/{id}.html` with the original source hyperlink
embedded — so every announcement has a real URL, not just a JS-rendered
homepage modal.

**Where it lives.** `scripts/generate-intelligence-pages.js`. Its header/
footer are lifted from `pages/legal/privacy-policy.html` as the structural
template source (see Implementation 01's footer-link fix for why that
matters — anything copied verbatim from a different directory depth needs
its relative paths rewritten at generation time, not left as-is).

**What depends on it.** The 9 (and growing) `pages/intelligence/*.html`
pages, and `sitemap.xml`'s intelligence-page block (§12), which this same
script keeps in sync on every run.

**How to extend it.** Publishing a new intelligence page is: add/edit the
record in `announcements.json`, then run
`node scripts/generate-intelligence-pages.js`. **Never hand-edit a
generated `pages/intelligence/*.html` file directly** — the generator is
the source of truth, and a manual edit will be silently overwritten (and
lost) the next time it runs. If a generated page is wrong, fix the
generator or the source record, then regenerate.

**What must not be duplicated.** A second page-generation script for a
different content type using different template-extraction logic — if a
new content type needs the same "generate a static page per data record"
pattern, extend this script's approach (or factor out its shared logic)
rather than writing an unrelated one from scratch.

**What should eventually become data-driven.** Already is, by design —
this is the one part of the site's static-HTML architecture that already
has a real generator/source-of-truth split. Nothing pending here.

**What is explicitly deferred.** Auto-running the generator via CI/a Git
hook (there is no CI in this repo — see the Stage 0 audit's deployment
finding); it remains a manual step run by whoever edits the data file.

---

## 12. Sitemap structure

**What it does.** `sitemap.xml` lists every real, servable page URL for
search-engine discovery.

**Where it lives.** `sitemap.xml` at the repo root.

**What depends on it.** SEO/crawlability only — no runtime code reads
this file.

**How to extend it.** This file is a **hybrid**: most entries are
hand-maintained (added by whoever built that page/section), but the
`pages/intelligence/*` block specifically is fully owned and rewritten by
`scripts/generate-intelligence-pages.js` on every run (it finds and
removes any existing intelligence-page `<url>` blocks, then appends a
fresh set). **Do not hand-edit an intelligence-page entry** — it will be
overwritten. Every other entry is hand-added when a new real page ships.

**What must not be duplicated.** A second sitemap file, or duplicate
`<url>` entries for the same page under different path casings/trailing
slashes.

**What should eventually become data-driven.** The hand-maintained
portion could, in principle, also be script-generated by walking
`pages/` for real (non-empty, non-underscore-archived) HTML files — not
built yet; the current split (generator owns intelligence pages, humans
own the rest) has been sufficient at current site size.

**What is explicitly deferred.** Full sitemap automation for every page
type, not just intelligence pages.

---

## 13. Country-page approach

**What it does.** A deliberately two-tier system, not an inconsistency:
a small number of countries (currently UAE, India, Singapore, UK, Saudi
Arabia, Qatar) have a **real, fully-built dedicated page** using the
shared country-page template; every other country in scope is represented
through a **data-driven directory + "Coming Soon" experience** instead of
a stub page — driven by per-region JSON registries
(`apac-countries.json`, `sepa-countries.json`, `latam-countries.json`,
`americas-countries.json`, `africa-countries.json`,
`middle-east-countries.json`) rendered into each `pages/regions/*.html`
directory page and the homepage region cards.

**Where it lives.** Real pages: `pages/countries/*.html`. Registries:
`assets/data/*-countries.json`. Directories: `pages/regions/*.html`. The
homepage interactive world map additionally reads
`assets/data/world-map-countries.json` — a **separate, curated subset**
for map-marker legibility, not the authoritative country list (its own
`schemaNote` field says so explicitly). The authoritative per-region
country lists are the six region-specific registries and
`pages/regions/*.html`, not the map file.

**What depends on it.** The homepage region cards, `pages/regions/*.html`,
the Markets mega-menu's Country Intelligence column, and the interactive
world map's click/tap-to-dashboard-or-toast behaviour.

**How to extend it.** Adding a new *real* country page: copy the existing
country-page template (§1's pattern), populate it, then link it from the
relevant region's registry entry (`"hasPage": true`-style field) so the
directory and map stop showing "Coming Soon" for it. Adding a country to
an *existing* region's coverage without a dedicated page yet: add its
entry to that region's JSON registry only — no HTML change required, the
directory renders it automatically.

**What must not be duplicated.** A second, competing "which countries
exist" list. If `world-map-countries.json` and a region registry ever
disagree, the region registry is authoritative — the map file is
allowed to be a curated subset, never the other way around.

**What should eventually become data-driven.** The 6 real country pages
themselves are still hand-authored HTML (the template-per-page pattern
from §1), not generated from a JSON record the way intelligence pages are
(§11). If the number of fully-built country pages grows substantially, a
generator following §11's pattern would be a reasonable evolution —
explicitly not needed yet at 6 pages.

**What is explicitly deferred.** Building real dedicated pages for the
~150+ remaining countries; this is intentional, progressive, content-scope
work, not a gap to close in one pass.

---

## 14. Responsive image approach

**What it does, where it lives, extension pattern.** Fully documented in
`docs/PERFORMANCE_ARCHITECTURE.md` §3.3 — `<picture>` + `srcset` + WebP,
with the `-w480/-w640/-w800` naming convention for dashboard/migration
imagery.

**What depends on it.** The dashboard gallery (§10) and any other large
photographic/screenshot asset on the site.

**What must not be duplicated.** A single-`<img>`, no-`srcset` pattern for
any new image over the size threshold documented in
`PERFORMANCE_ARCHITECTURE.md` §3.4 — `gpir-perf-audit.js` check 1 already
flags this automatically.

**What is explicitly deferred.** Automated image-variant generation at
authoring time (variants are currently produced by whoever adds the
asset, by hand, following the naming convention) — a build-time image
pipeline would remove that manual step but requires build tooling this
site deliberately doesn't have.

---

## How to use this document

Before replacing, rewriting, or removing any system listed above, a
future coding agent should: (1) find it in the quick-reference table,
(2) read its "must not be duplicated" and "explicitly deferred" lines,
and (3) if the intended change conflicts with either, stop and get
explicit human approval rather than proceeding. Extending a system per
its "how to extend" guidance does not require this pause — that's what
these systems are already designed to absorb.

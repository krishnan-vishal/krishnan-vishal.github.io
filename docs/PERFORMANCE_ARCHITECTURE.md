# GPIR Performance Architecture

This is a factual reference for how GPIR keeps page weight and rendering
cost independent of total content size — written as a baseline for future
work, not an aspirational specification. Everything described here exists
and runs; nothing in this document is a stub or a plan. Companion to
`docs/ARCHITECTURE.md` (content/data layering) — this document covers the
delivery/rendering side.

GPIR is a static site (HTML/CSS/vanilla JS, served by GitHub Pages). There
is no backend, no build step, and no framework. Every mechanism below is
achieved with plain `<link>`/`<script>` tags, inline `<script>` blocks,
CSS media queries, and browser-native APIs (`loading="lazy"`,
`IntersectionObserver`, `content-visibility`, `<picture>`/`srcset`,
`navigator.connection`) — nothing here requires a bundler, a CDN beyond
what GitHub Pages already provides, or a service worker.

**Status key used throughout this document**, per the GPIR performance
governance standard (§12 onward):

- **IMPLEMENTED** — exists, running in production today, verified by test.
- **MANDATORY FOR FUTURE CONTENT** — a rule every new page/asset must
  follow; not automatically enforced by a build step (there is none), but
  checked by `scripts/gpir-perf-audit.js` (§16) and the checklist (§17).
- **MONITORED** — not a problem today, but a metric with a defined
  threshold that's watched so the decision to act is triggered by a
  number, not a guess.
- **TRIGGER-BASED FUTURE ARCHITECTURE** — deliberately not built; would
  only be built once its specific documented trigger is actually reached.

§§1–11 below (the original v2/v2.1 performance-sprint content) are all
**IMPLEMENTED**. §12 onward is the governance layer added to keep that
foundation intact as GPIR grows past its current ~40 pages toward 150+
countries, hundreds of dashboards and thousands of research sections.

---

## 1. The core problem this solves

GPIR is a long-life knowledge repository: the number of countries, regions,
dashboards, maps and research pages is expected to keep growing for years.
Without a deliberate architecture, "more content" becomes "more bytes
every page pays for," because a static multi-page site has no natural
mechanism to isolate what one page needs from what the whole repository
contains.

The mechanisms in this document exist to keep those two things separate:

- **Content scale** — how many countries/dashboards/pages exist in the
  repository (grows without bound over time).
- **Page load scale** — how much a single page visit actually costs to
  render (must not grow just because the repository does).

---

## 2. Performance-tier engine

**File:** an inline `<script>` block in every page's `<head>` (same
snippet on all 40 live HTML files, immediately after the viewport meta
tag, before any CSS `<link>`).

On every page load, before first paint, it reads local, non-transmitted
device/network signals — `navigator.deviceMemory`, `navigator.hardwareConcurrency`,
`navigator.connection.effectiveType`, `navigator.connection.saveData`, and
`prefers-reduced-motion` — and resolves one of three tiers:

| Tier | Trigger | Effect today |
|---|---|---|
| `HIGH` | ≥8GB RAM, ≥8 cores, no slow-network signal | Full visual experience (default map/animation behavior) |
| `STANDARD` | Everything not HIGH or CONSTRAINED | Default experience (majority of readers) |
| `CONSTRAINED` | ≤2GB RAM, or ≤2 cores, or `saveData`/2G/3G effective type | Reduced map complexity (see §5) |

The tier is written to `document.documentElement.dataset.gpirPerf`
(`data-gpir-perf="constrained"`) so CSS can react without FOUC, and to
`window.GPIRPerf` (`{ tier, saveData, effectiveType, deviceMemory,
hardwareConcurrency, reduceMotion }`) so JS components can read it.
Nothing here is fingerprinted or sent anywhere — it's read once, per
page load, and stays in memory.

`navigator.deviceMemory` and `navigator.connection` are Chromium-only
today (not in Safari/Firefox); on browsers without them the engine falls
back to `STANDARD` — every reader gets the default experience, no reader
gets a broken one. This is why the tier is a *hint* consumed by a small
number of components, not a hard gate the whole page depends on.

---

## 3. Progressive / lazy loading

### 3.1 The interactive world map (`assets/js/world-map.js`)

The map sits well below the fold on every page that has one. `init()` no
longer builds the ~1,600-node SVG dot texture and fetches
`world-map-countries.json` on `DOMContentLoaded`. Instead:

1. An `IntersectionObserver` with `rootMargin: "600px 0px"` watches the
   map container.
2. The actual build (`buildMap()`) — land-dot texture, corridor arcs,
   country markers, fetch of the 14KB country registry — only runs once,
   the first time the map is within 600px of the viewport.
3. Falls back to building immediately if `IntersectionObserver` isn't
   supported (progressive enhancement, not a hard requirement).

A second, pre-existing `IntersectionObserver` + `visibilitychange` pair
(from the prior performance sprint) pauses the corridor-flow-dot and
marker-pulse CSS animations whenever the map scrolls off-screen or the
tab is backgrounded, and resumes them when it's back — so the map never
burns compositor cycles nobody can see.

**Tier-aware complexity** (`getDotStep()` in `world-map.js`): on
`CONSTRAINED` tier the land-dot texture uses a 6° lat/lon step instead of
3° (~4× fewer SVG nodes), and animated corridor-flow dots are skipped
entirely — the static corridor arcs still convey the corridor, just
without a continuously-animating layer.

**Failure isolation:** `buildMap()` and the outer `runBuild()` are both
wrapped in `try/catch`. If dot-texture generation throws, or the country
JSON fetch fails, `.world-map-canvas--error` is added and a static
"Map data unavailable — please refresh" message renders in its place
(`global.css`) — the map can never take the rest of the page down with it.

### 3.2 Client-side search (`assets/js/content-search.js`)

The ~300KB search index (`assets/data/search-index.json`, 307
section-level records) used to be fetched unconditionally on every page
load, regardless of whether the reader ever opened search — the exact
"pay for content you don't use" anti-pattern this architecture exists to
avoid.

It now loads lazily: `GPIRContentSearch.load()` is called (a) on the
search toggle's first `mouseenter`/`focus` (load-on-intent, so it's
often already resolved by the time the reader clicks) and (b) on the
overlay actually opening, as a guaranteed trigger. `isLoading()` lets the
UI show a "Loading GPIR content index…" hint if a query is typed before
the fetch resolves. Navigation-only search (chapter/mega-menu titles,
built from the DOM) still works instantly with zero network cost, since
it never depended on the index.

### 3.3 Responsive images (`<picture>` + `srcset` + WebP)

**Naming convention:** every generated image family has one canonical
master (the highest-resolution real render, used for the lightbox/full-
resolution view and as the ultimate srcset fallback) plus derived width
tiers, generated by `gen_responsive_images.py`-style scripts and never
upscaled past the master's native width:

```
{basename}.png            <- canonical master (lightbox target, unchanged)
{basename}.webp           <- native-resolution WebP of the master
{basename}-w480.png/.webp
{basename}-w640.png/.webp
{basename}-w800.png/.webp <- inline "reading column" tier (chapter-content max-width:800px)
{basename}-w960.png/.webp
{basename}-w1280.png/.webp
```

Every dashboard/migration `<img>` is a `<picture>` with a `<source
type="image/webp">` srcset and a PNG `<img>` fallback srcset, each with a
`sizes` attribute matching the real display context (`380px`-ish gallery
cards vs `800px` reading-column embeds). The anchor's
`data-lightbox-src`/`href` still point at the untouched canonical master
— clicking through to full resolution is unaffected by which tier the
inline thumbnail happened to pick.

Measured savings (PNG master → smallest WebP tier actually served on a
mobile viewport, from `gen_responsive_images.py` output):

| Image family | Native master | Smallest WebP tier served on mobile |
|---|---|---|
| Dashboard gallery card thumbnail (2560×1620) | 358–383KB | 21–22KB (`-w480.webp`) |
| Country-page dashboard embed (1536×1024) | 558KB–2.0MB | 39–43KB (`-w480.webp`) |
| Migration & Diaspora embed (3200×1626) | 738–750KB | 11KB (`-w480.webp`) |

A mobile reader today downloads roughly 1/15th to 1/65th of what the
un-tiered master would have cost, for the exact same visible image.

### 3.4 `loading="lazy"` / `decoding="async"` audit

Every non-critical image sitewide already carried `loading="lazy"`
(dashboard thumbnails, architecture/intelligence-library thumbnails, flag
icons, payment-family icons); the responsive-image work above added
`decoding="async"` to the picture-ized images so decode work doesn't
block the main thread even once the bytes arrive. The header brand mark
and footer logo are intentionally **not** lazy-loaded — they're
always-visible chrome, not content a reader scrolls to.

---

## 4. `content-visibility` and CSS containment

Applied narrowly, to specific components with a real reason, not
blanket-applied to the page:

| Selector | File | Why |
|---|---|---|
| `#footer` | `footer.css` | ~1,800px of nav columns/tickers/legal links, present on every page, never in the initial viewport |
| `.chapter-content section:not(:first-of-type)` | `chapter-page.css` | Chapter/country pages run to a dozen-plus long-form sections; a 12-section page shouldn't cost 12× a 2-section page to first-render |
| `.directory-grid` | `country-intelligence.css` | Region pages repeat this once per sub-region (up to five times on Africa, 55 country tiles total) |

Each uses `content-visibility:auto` with `contain-intrinsic-size:auto
<estimate>px` — the `auto` keyword means the browser remembers the real
size after the first time an element is revealed, so an imprecise initial
estimate only affects the very first reveal, not every subsequent one.
`content-visibility:auto` skips layout/paint for off-screen content but
never removes it from the DOM or the accessibility tree — footer links
stay keyboard-focusable and screen-reader-visible whether or not they've
been scrolled to (verified: see §8).

Separate from content-visibility, plain CSS `contain:layout style` (and
`paint` where an existing `overflow:hidden` already established a clip
boundary, so containment changes nothing visually) is applied to
`.world-map-canvas`, `.dashboard-card` and `.dashboard-embed` — these are
self-contained visual units (a map rebuild, a card hover, an image swap)
that shouldn't force the browser to re-check layout for the rest of the
page.

---

## 5. Animation budget

Every continuous (`infinite`) animation on the site, audited for
justification, reduced-motion behavior, and visibility behavior:

| Animation | File | Purpose | Duration | Reduced-motion | Visibility behavior |
|---|---|---|---|---|---|
| `wmPulse` (`.wm-marker-pulse`) | `global.css` | Draws the eye to active map markers | 2.6s | Removed entirely (`display:none`) | Paused off-screen/backgrounded via `.wm-paused` |
| `wmFlow` (`.wm-flow-dot`) | `global.css`, applied inline by `world-map.js` | Shows corridor direction/flow on the map | 3.5–7s (varies per corridor) | Never built (skipped in `buildCorridorArcs`) | Paused off-screen/backgrounded; also skipped entirely on `CONSTRAINED` tier |
| `tickerMove` (`.market-ticker-track`) | `market.css` | Live FX-rate ticker | 60s linear | Animation removed, `overflow-x:auto` fallback | Not currently visibility-paused (short/simple track; flagged below) |
| `scrollTicker` (`.ticker-track`) | `page.css` | Global Announcements ticker | 60s linear | Animation removed, `overflow-x:auto` fallback | Not currently visibility-paused (flagged below) |
| `bounce` (`.scroll-indicator`) | `hero.css` | Hero "scroll down" chevron | 2s | **Fixed this sprint** — was previously missing `prefers-reduced-motion` coverage entirely; now `animation:none` under reduced motion | Only present in the hero, always near-viewport when relevant |

One-shot entrance animations (`fadeLeft`/`fadeRight`/`fadeUp`/
`footerMetricReveal`/`fadeRegion`, all `both`/`forwards`, not `infinite`)
run once on scroll-into-view and then stop — negligible ongoing cost, not
included in the continuous-animation table above.

**Known remaining gap, not fixed this sprint:** the two 60s marquee
tickers (FX rates, announcements) don't yet pause when scrolled off-screen
or tab-backgrounded, unlike the map. They're intentionally excluded from
this pass because pausing/resuming a `transform: translateX()` marquee
majority-through its cycle requires either storing/restoring animation
offset (to avoid a visible jump on resume) or switching to a JS-driven
`requestAnimationFrame` loop — meaningfully more surface area than the
map's discrete pulse/flow animations, and the map — not the tickers —
was the component actually measured to matter for main-thread cost.
Flagged here as a legitimate next-sprint candidate rather than silently
dropped.

---

## 6. Caching

GitHub Pages fronts every static asset with its own CDN and sets
standard HTTP caching headers automatically — there is no way to
configure this further from within the repository (no `_headers` file,
no server config). What the repository *does* control:

- **Cache-busting:** every CSS/JS `<link>`/`<script>` tag carries a
  `?v=YYYYMMDD`-style query string, bumped when that file changes, so a
  returning reader gets the new version without needing a hard refresh.
- **Long-lived assets:** dashboard/migration images, flag SVGs and font
  files change rarely and are referenced by stable filenames — GitHub
  Pages' default caching already serves these efficiently on repeat
  visits.

No service worker exists (see §9 — deliberately not added without a
measured need). **Data freshness over aggressive caching** is the
explicit priority: a stale GPIR intelligence dataset is worse than a
slightly slower page, so nothing here trades correctness for cache hit
rate.

---

## 7. Search scalability strategy

**Current:** one static, pre-generated `assets/data/search-index.json`
(307 records, ~295KB today), lazy-fetched on first search interaction
(§3.2), matched entirely client-side with no per-keystroke network
requests. Each record is already metadata-plus-snippet (title, category,
country, region, header, and one section's extracted text — average
587 bytes, max 2.6KB) — not full page documents, so the "load only
metadata/snippets first, full content on selection" principle is already
how the index is shaped, not something layered on top.

**Migration threshold (not reached, not preemptively built):** if the
index grows to roughly 3–5MB (an order of magnitude beyond today, meaning
several thousand more indexed sections — hundreds of additional country
pages' worth of content) or client-side match latency becomes noticeably
janky on a mid-range device, that's the trigger to move to a server-side
or edge-function search endpoint. Below that threshold, a static index
lazy-fetched once per search session is simpler, has no backend to
operate, and is fast enough that building the server-side version now
would be solving a problem GPIR doesn't have yet.

---

## 8. What was tested and how

No real device lab or physical network conditions were available in this
environment. Testing used:

- **Playwright + headless Chromium** across desktop (1440×900, 1920×1080)
  and mobile (390×844, 375×812) viewports, for functional/regression
  verification: lazy map build timing (0 SVG dots before scroll, 1,400+
  after), lazy search-index fetch timing (no request until search
  opened), `<picture>`/`srcset` tier selection (`currentSrc` verified
  distinct per viewport), lightbox still resolving to the untouched
  full-resolution master, footer/section/directory content staying
  keyboard-focusable under `content-visibility:auto`, map tooltip/hover
  still functioning under CSS containment, and zero new console errors
  or broken asset requests across every touched page.
- **Forced device-capability override** (`Object.defineProperty` on
  `navigator.deviceMemory`/`hardwareConcurrency` before page scripts run)
  to verify the `CONSTRAINED` tier path actually takes effect: confirmed
  fewer land-dots built (350 vs 1,431 at default tier) and zero animated
  corridor-flow dots.
- **Before/after transfer measurement**: a git worktree checked out at
  the commit immediately preceding this sprint (`ab5c3a1`) served
  alongside the current working tree, both through the same local
  Python `ThreadingHTTPServer`, measuring bytes/requests up to the
  `load` event (the point native `loading="lazy"` deliberately doesn't
  block). See §8.1 for results and an important caveat about this
  method's limits.
- **Not available in this environment:** real iOS/Android/tablet
  devices, real Wi-Fi/4G/3G network conditions, Lighthouse/CrUX
  field data, and a CDN-backed hosting comparison — GitHub Pages'
  actual production latency characteristics can't be reproduced by a
  single-process local file server. Absolute millisecond figures below
  are an artifact of that local server, not a claim about production
  timing; the request-count and transferred-byte deltas are the
  reliable signal.

### 8.1 Before / after (local measurement, see caveat above)

Measured at a 390×844 mobile viewport, bytes/requests counted up to the
`load` event:

| Page | Requests (before → after) | Transferred (before → after) |
|---|---|---|
| Home | 76 → 74 | 16,266KB → 15,977KB (−289KB) |
| Regional (Middle East/GCC) | 36 → 35 | 2,879KB → 2,597KB (−282KB) |
| Country (UAE) | 39 → 38 | 3,436KB → 2,640KB (−796KB) |
| Chapter (Trade Payments) | 36 → 35 | 2,875KB → 2,592KB (−283KB) |

**Important caveat:** these totals are measured at the `load` event with
no scrolling, yet still show 15+MB of image weight on the homepage. That
is a headless-Chromium artifact, not a real-world number: on a very fast
loopback connection, Chromium's native `loading="lazy"` distance
threshold (which scales with perceived connection speed) becomes
extremely generous and ends up fetching nearly every lazy image on a
very long page well before `load` fires — a real reader on a real
network would see dramatically less than this. The *direction* of every
delta (fewer requests, fewer bytes, every page, no regressions) is real
signal; the absolute totals are not representative of a real visit. The
per-asset compression numbers in §3.3, and the direct `currentSrc`
tier-selection verification in §8, are the more trustworthy evidence for
what a real mobile reader actually downloads.

---

## 9. Explicitly not built, and why

Per the standing instruction not to classify a requirement as "not
needed" without saying why, what's possible now, and what would trigger
building it:

| Requirement | Why not now | What's done instead | Future trigger |
|---|---|---|---|
| Service worker / PWA caching | No measured need yet; a stale intelligence dataset is a worse failure mode than a slightly slower repeat visit, and a service worker adds a real cache-invalidation surface to get right | GitHub Pages' own CDN + cache-busted asset URLs (§6) | Repeat-visit load time becomes a measured problem *and* a safe versioned cache-invalidation design is worked out first |
| Web Workers | No client-side computation heavy enough to justify one — the map's dot-texture build is a few hundred synchronous operations, not a bottleneck | Lazy/deferred main-thread work (§3.1) | A future feature (e.g. client-side aggregation across hundreds of dashboards) does real CPU-bound work measured to block interaction |
| Server-side/edge search | Current index is 295KB, lazy-loaded, fast enough client-side | Lazy-loaded static index (§7) | Index reaches the ~3–5MB range described in §7 |
| Additional CDN layer | GitHub Pages already provides CDN-backed delivery for every asset in this repo | Existing GitHub Pages CDN + compressed/responsive assets | Media volume or traffic pattern GitHub Pages' CDN can't practically serve (not yet observed) |
| Framework/SPA/build-step migration | No architectural bottleneck has been measured that a build step would fix — every mechanism in this document runs in plain HTML/CSS/JS | Component-level conventions (§10) instead of framework components | See the migration-trigger table in `docs/ARCHITECTURE.md`-style terms below |
| Marquee ticker pause-on-hidden | Real gap, see §5 — deliberately scoped out this sprint rather than rushed | `prefers-reduced-motion` fallback already stops the animation for readers who need it | Next performance sprint; needs an offset-preserving pause design, not just a class toggle |

---

## 10. Component authoring conventions

There's no component framework here, so "component" means a documented,
repeatable HTML/CSS/JS pattern future pages should copy rather than
reinvent. These are the ones already proven out by the mechanisms above:

- **GPIRImage** — any content image beyond a small icon: `<picture>`
  with a WebP `<source>` + PNG `<img>` fallback, both with real
  `srcset`/`sizes`, explicit `width`/`height` on the `<img>` (CLS
  prevention), `loading="lazy"` + `decoding="async"` unless it's
  always-visible chrome. See §3.3 for the exact tier-naming convention.
- **GPIRMap** — a map/heavy-visualization container: build deferred
  behind an `IntersectionObserver` until near-viewport, tier-aware
  complexity via `window.GPIRPerf.tier`, `try/catch` around the build
  with a visible fallback state, pause-on-hidden for any continuous
  animation inside it, `contain:layout style` on the container. See §3.1.
- **GPIRDashboard / GPIRHeatMap** — same image pipeline as GPIRImage
  (these are pre-rendered PNGs, not live-rendered visualizations); the
  lightbox pattern (`data-lightbox-src` pointing at the untouched
  canonical master, in-page modal reusing the document-level
  content-protection listeners) is the standard "full resolution on
  demand" pattern.
- **GPIRTicker** — any marquee/ticker: `prefers-reduced-motion` fallback
  to `overflow-x:auto` is mandatory (§5); pause-on-hidden is the known
  gap, not yet standard (§9).
- **GPIRInteractiveCard / GPIRCountryProfile / GPIRRegionalProfile** —
  any repeated card/tile grid with dozens of items: `content-visibility:
  auto` with a reasonable `contain-intrinsic-size` estimate on the grid
  container once item counts run past roughly 15–20 (§4).
- **GPIRTooltip** — the existing map tooltip (mouseenter/focus-triggered,
  positioned relative to its trigger, dismissed on outside-click/Escape)
  is the reference implementation for any future hover-intelligence
  component; it does not chase the cursor and stays stable once shown.

---

## 11. Future architectural migration triggers

Continue optimizing this static architecture until one of these is
actually observed — not in anticipation of it:

- The search index (§7) crosses ~3–5MB.
- Initial HTML for a single page becomes materially large on its own
  (independent of images) — e.g. a page's markup alone exceeding a few
  hundred KB before any asset loads.
- Client-side JS across the shared engines (`script.js`, `world-map.js`,
  `content-search.js`, `i18n.js`, etc.) grows enough that parse/execute
  time is measured to matter on a mid-range device — not merely that the
  file count has grown.
- Country/region page maintenance becomes error-prone by hand (e.g. a
  template drift across 150+ country pages that manual find/replace
  scripts can no longer safely manage) — at that point a lightweight
  static-site generator (not a full framework) would be the proportionate
  next step, still without a client-side framework.
- Real-time/dynamic intelligence (as opposed to periodically-updated
  static JSON) becomes a requirement — this needs actual server-side
  infrastructure, which nothing here provides today.
- Traffic patterns exceed what static GitHub Pages delivery can
  practically serve (not observed; GitHub Pages' CDN handles static
  traffic at a scale far beyond this site's current or foreseeable
  volume).

None of these are close today. This document exists so the decision, when
it comes, is made against an observed threshold — not a guess.

---

## 12. Performance governance (v3): the core rule

**IMPLEMENTED / MANDATORY FOR FUTURE CONTENT.**

Everything above (§1–11) optimized the site as it exists today. This
section exists because that's not the same problem as keeping the site
fast as it grows to 150+ countries, hundreds of dashboards, and thousands
of research sections. The rule that governs every future addition:

> **Adding a country, dashboard, map or research page must only
> materially affect that item's own page, its regional directory, and
> the search index. It must never grow what an unrelated page has to
> load.**

This isn't aspirational — it's already how the architecture is shaped
(§3–5: the map only loads on the homepage, images are per-country
responsive tiers, the search index is fetched once on demand) — but it
has to be actively re-verified every time content is added, because nothing
stops a future page from quietly violating it (see §15 for two real
examples found and fixed during this sprint, neither of which a human
reviewer would have caught by eye).

---

## 13. Performance budgets

**IMPLEMENTED (baseline measured) / MONITORED (thresholds going forward).**

Measured locally (Python `http.server`, not GitHub Pages' real CDN — see
the caveat in §8) at a 1440×900 viewport, bytes counted to the `load`
event, immediately after the fixes in §15 landed:

| Page type | Requests | Total transfer | HTML | CSS | JS | Images | JSON |
|---|---|---|---|---|---|---|---|
| Home (Dashboard Gallery + World Map) | 61 | 758KB | 214KB | 325KB | 102KB | 85KB | 32KB |
| Regional (Middle East/GCC) | 43 | 343KB | 82KB | 194KB | 54KB | 4KB | 9KB |
| Country (UAE, incl. Migration dashboard) | 38 | 462KB | 75KB | 197KB | 58KB | 124KB | 9KB |
| Chapter (Trade Payments) | 34 | 335KB | 78KB | 194KB | 54KB | 0KB | 9KB |

GPIR doesn't have separate "Dashboard page" or "Map page" URLs today —
both live embedded in the homepage (§14) — so those two spec-requested
page types are covered by the Home row above, noted honestly rather than
measured against pages that don't exist.

**Budget table** (target = current baseline, rounded up; warning = a real
regression worth investigating; failure = act before publishing further
content of that type):

| Metric | Target | Warning | Failure |
|---|---|---|---|
| Total transfer (by `load`) — Home | ≤800KB | 1.2MB | 2MB |
| Total transfer — Regional/Country/Chapter | ≤500KB | 800KB | 1.5MB |
| Requests — any page | ≤65 | 90 | 130 |
| CSS transfer — any page | ≤350KB | 500KB | 700KB (see §18 — this is the least efficient budget line today, a known candidate for future incremental improvement) |
| Image transfer — Home | ≤150KB | 400KB | 1MB (before responsive delivery, §3.3) |
| Search index (`search-index.json`) | ≤2MB | 3MB | 5MB (see §7) |

LCP/CLS/INP use industry-standard Core Web Vitals thresholds rather than
this environment's local numbers, because the local single-process dev
server's timing isn't representative of GitHub Pages' real CDN (§8, §14):

| Metric | Good (target) | Needs improvement (warning) | Poor (failure) |
|---|---|---|---|
| LCP | ≤2.5s | ≤4s | >4s |
| CLS | ≤0.1 | ≤0.25 | >0.25 |
| INP | ≤200ms | ≤500ms | >500ms |

CLS was measured at effectively zero across every tested page (0.0004 on
Home, 0 elsewhere) — the explicit-`width`/`height` and `content-visibility`
work in §1–11 is holding. LCP/INP need real-device/real-network
measurement to validate against these thresholds meaningfully — see §19.

---

## 14. Homepage payload: four phases, not one number

**IMPLEMENTED.**

The prior sprint's ~15MB local measurement was correctly flagged as
partly a headless-Chromium-on-loopback artifact, but "partly" wasn't the
whole story — investigating further (per the explicit instruction not to
dismiss that finding) surfaced two genuine bugs, fixed in §15. After
those fixes, the homepage's real shape across four phases:

| Phase | What it means | Requests | Transfer |
|---|---|---|---|
| **Initial** (by `DOMContentLoaded`) | Render-blocking CSS/JS + the doc itself | 52 | 695KB |
| **Above-the-fold** (visible in a 1440×900 viewport, no scroll) | 7 images: header/flag icons + the hero coverage map | 7 | 57KB |
| **First-interaction** (by the `load` event, before any scroll/click) | Everything native `loading="lazy"` correctly deferred past this point | 52 | 695KB (identical to Initial — nothing extra loads by `load` on this page) |
| **Full-page** (after scrolling the entire page, letting every lazy image and the map load) | The complete repository of homepage content | 78 | 1,132KB |

The gap between **first-interaction (695KB)** and **full-page (1,132KB)**
— roughly 440KB — is exactly the content a reader never pays for unless
they scroll to it: the Dashboard Gallery thumbnails, architecture/
intelligence library images, and the world map's country registry fetch.
That gap is the concrete evidence that "content-first, lazy the rest"
(§3) is doing its job.

---

## 15. Case study: two governance bugs found this sprint

Neither of these was visible by eye or caught by the previous sprint's
Playwright tests — both needed the payload-phase investigation in §14 and
the dev-time audit script in §16 to surface. They're recorded here as the
concrete argument for why "prevent accidental performance regression"
(§27 of the governing sprint prompt) needs tooling, not vigilance alone.

**Bug 1 — a 2.2MB favicon on every single page.** `assets/favicon/
favicon.svg`, referenced via `<link rel="icon" type="image/svg+xml">` on
all 39 live pages, was not a real vector icon — it was a
`RealFaviconGenerator` export wrapping a base64-encoded 1248×1248 PNG
inside `<svg><image xlink:href="data:image/png;base64,...">`. Because
browsers prefer an SVG favicon over the `.ico`/PNG alternatives when one
is listed, this was the browser's actual pick — 2.2MB fetched for a
16×16 tab icon, on every page, before any content-related optimization
even had a chance to matter. **Fix:** removed the broken `<link>` tag
site-wide; the existing `favicon.ico` + 16×16/32×32 PNG + apple-touch-icon
`<link>` tags already provide the identical visible icon at a fraction of
the size. Full-page homepage transfer dropped from 3.4MB to 1.1MB from
this one change alone.

**Bug 2 — two tickers with colliding CSS, one of them silently running
the wrong animation.** `assets/css/style.css` (homepage only) contained
11 `@import` statements at its top — a render-blocking waterfall (see
§3.4's Google Fonts fix from the prior sprint for the same anti-pattern)
where 8 of the 11 imported files were *also* already linked directly in
`index.html`'s `<head>`, meaning they were fetched twice. Three files
(`stats.css`, `executive.css`, `page.css`) were reachable *only* through
that blocking `@import` chain. Flattening the imports into direct
`<link>` tags exposed a second, worse problem underneath: `market.css`
(FX ticker) and `page.css` (Global Announcements ticker) both style a
generic `.ticker-track` class at equal CSS specificity — and because
`@import`'d content is inserted at the position of the `@import`
statement, the *actual* winner for `.ticker-track{animation:...}` on
**both** tickers was whichever file's rule happened to land last in the
resulting cascade. It was `market.css`'s `tickerMove` — meaning the
Global Announcements ticker had been silently running the FX ticker's
animation the entire time, not its own `scrollTicker`. This was
invisible because both are 60s linear marquees, but they're built for
different content: `tickerMove` (`translateX(0)→translateX(-50%)`)
assumes duplicated content for a seamless loop, which is what
`fx-ticker.js` does (`track.innerHTML = html + html`); `scrollTicker`
(`translateX(100%)→translateX(-100%)`) is a full sweep for
non-duplicated content, which is what `announcements.js` actually
renders. The announcements ticker was therefore looping on math designed
for content it doesn't have — a jump-cut every cycle rather than the
smooth sweep it was built for. **Fix:** scoped both rules by container ID
(`#fx-ribbon .ticker-track` / `#market-ribbon .ticker-track`), which
resolves the collision by specificity rather than by fragile load order,
and updated both `prefers-reduced-motion` overrides to match the new
selectors (an easy follow-on mistake — raising a base rule's specificity
without raising its override's specificity the same way silently breaks
the override, which is exactly what happened on the first pass of this
fix and was itself caught by `scripts/gpir-perf-audit.js`, §16). Verified
via `getComputedStyle(...).animationName`: each ticker now runs its own
correct animation, `getAnimations()[0].currentTime` progresses
continuously across pause/resume (§20), and reduced-motion correctly
disables both.

The lesson generalized into governance: **a bare class name shared across
two component stylesheets is a load-order-dependent bug waiting to
happen.** New components must scope shared-looking class names
(`.ticker-track`, `.card`, `.tile`) to their container, not rely on file
load order to keep them apart.

---

## 16. The dev-time performance audit script

**IMPLEMENTED.**

`scripts/gpir-perf-audit.js` (Node, no dependencies beyond the standard
library — `fs`, `path`, `crypto`). Run it locally before publishing new
content:

```
node scripts/gpir-perf-audit.js
```

It is advisory only (always exits 0) — per the sprint principle "the
objective is not to block development unnecessarily, [but] to prevent
accidental performance regression." It checks:

1. **Images** — every `<img>` across every live page: missing
   `width`/`height` (CLS risk), missing `alt` attribute (decorative
   `alt=""` is correctly accepted, only a fully absent attribute is
   flagged), and images over 150KB with no `srcset`/`<picture>`. Images
   sized entirely by CSS (`.flag-icon`, `.brand-logo`, `.footer-logo` —
   confirmed to carry unconditional CSS width/height in every context
   they appear) are correctly exempted, since the HTML attribute would be
   redundant there, not a real gap.
2. **Duplicate/near-duplicate media** — SHA-1 hashes every media file
   under `assets/` (excluding `assets/master-libraries/`, a source/
   staging archive never referenced by any served page, and 0-byte stub
   files, which hash-match trivially and aren't a real duplicate) and
   flags byte-identical files under different names, plus filenames
   matching a `-final`/`-new`/`-copy`/`-old`/`-draft` pattern.
3. **Search index size** — warns against the 2/3/4/5MB ladder from §7.
4. **Reduced-motion coverage** — for every continuous (`infinite`) CSS
   animation found (in `<style>` rules or JS-applied via
   `.style.animation =`), extracts the selector that declares it and
   checks whether that *same selector* appears inside a
   `prefers-reduced-motion` override elsewhere in the codebase. (Matching
   on the selector, not the animation name, matters — a reduced-motion
   override almost never repeats the keyframe name, it sets
   `animation:none` on the selector that uses it.)
5. **Global vs. page-specific script loading** — counts how many of the
   58 HTML files (39 live pages + 19 archive/legacy files the walker
   doesn't specially exclude by name) load each `assets/js/*.js` file,
   and specifically checks that `world-map.js` loads on exactly one page.

Current output on this codebase: 3 informational warnings (an orphaned
legacy page outside the linked site graph, and two small byte-identical
logo files) — see §18 for the full script/CSS inventory.

---

## 17. Content-addition checklist

**MANDATORY FOR FUTURE CONTENT.**

Before publishing a new country, region, dashboard, map, heat map,
research page, media card, or animation:

- [ ] Image follows the GPIRImage convention (§10): canonical master +
      responsive width tiers + WebP `<source>` + explicit
      `width`/`height` + `sizes` + `loading="lazy"` (unless genuinely
      above-the-fold) + `decoding="async"`.
- [ ] `alt` text is present and meaningful (or explicitly `alt=""` for a
      confirmed-decorative image, not just omitted).
- [ ] No new global `<script>`/`<link>` added to *every* page for
      something only one page/component needs (§18) — page-specific and
      component-specific scripts stay scoped.
- [ ] No new render-blocking resource (a `@import` chain, an
      unnecessary synchronous `<script>` in `<head>`) — see §15's case
      study for what this looks like when it goes unnoticed.
- [ ] Any new continuous (`infinite`) animation has: a documented
      purpose, `prefers-reduced-motion` coverage, and an off-screen/
      tab-hidden pause if it's expensive enough to matter (§5, §20).
- [ ] Any new hover/tooltip/card interaction follows the existing GPIR
      interaction language: no cursor-chasing, no layout shift, stable
      positioning (§10's GPIRTooltip reference).
- [ ] New map/heavy visualization follows the GPIRMap pattern (§10,
      §3.1): deferred `IntersectionObserver` init, tier-aware
      complexity, `try/catch` failure isolation with a visible fallback.
- [ ] New dashboard is classified (static image / interactive data / live
      data / animated visualization) and uses the lightest form that
      actually serves the content — a static research graphic doesn't
      need an interactive data engine.
- [ ] Content is indexed in `assets/data/search-index.json` as
      metadata + snippet, not full page text (§7, §22).
- [ ] Mobile layout checked at 375px and 1440px, no horizontal overflow.
- [ ] Run `node scripts/gpir-perf-audit.js` (§16) and address anything it
      flags for the new content specifically.

---

## 18. Shared JS/CSS load audit

**IMPLEMENTED (JS) / MANDATORY FOR FUTURE (CSS, incremental only).**

**JavaScript** — confirmed via `scripts/gpir-perf-audit.js`'s script-count
check: `world-map.js` (the heaviest client-side component, §3.1) loads on
exactly 1 of 58 files, as designed. The shared "site chrome" scripts
(`script.js`, `i18n.js`, `footer-utilities.js`, `content-search.js`,
`content-protection.js`, `fx-ticker.js`) load on all 39 live pages
because every page genuinely needs navigation, translation, search,
content protection and the FX ticker — that's correctly global, not
scope creep. `dashboard-lightbox.js` (6 pages), `trust-engine.js` and
`announcements.js` (1 page, homepage) are correctly scoped to only the
pages that use them.

**CSS** — the opposite finding: every one of the 26 stylesheets under
`assets/css/` loads on every page, including page-type-specific ones
(`hero.css`, `command-centre.css`, `intelligence-library.css`,
`observatory.css`, `payments-timeline.css`, `purpose.css`, `knowledge.css`
— all homepage-only components, still loaded in full on a chapter or
country page that never uses them). This is a real instance of the
pattern §6 of the governing sprint warns about ("large component-specific
styles loaded globally"), and it's the largest remaining line item in the
budget table (§13) — CSS transfer (194–325KB) exceeds JS transfer
(54–102KB) on every page type measured.

**Why this isn't fixed in this sprint:** the governing instruction is
explicit — "do not perform a dangerous wholesale CSS rewrite. Make
incremental, verified improvements." Splitting 26 interdependent
stylesheets by page type requires first auditing which selectors in each
file are actually referenced cross-file (the ticker collision in §15 is
a preview of exactly the kind of bug a rushed split would reintroduce at
scale) — that audit is bigger than this sprint's remaining scope and
belongs in its own pass. Documented here as the next legitimate
incremental-CSS-governance candidate rather than either attempted
hastily or silently dropped.

---

## 19. Real-device and real-network test plan

**MONITORED — plan documented, not yet executed; no measurements
fabricated.**

No physical devices or real network conditions were available in this
environment (a cloud execution container, not a device lab), consistent
with the prior sprint's disclosure. This section is the plan for when
they are, not a claim that they've been run:

**Devices (minimum target):**

| Device | Browser | What to verify |
|---|---|---|
| iPhone (current + one generation back) | Safari | Map/dashboard rendering, `<picture>`/WebP fallback, touch tooltip behavior |
| Android (mid-range) | Chrome | CONSTRAINED-tier map behavior (§2) actually engages on real low-end hardware, not just the forced-override test used in this environment |
| iPad | Safari | Layout at tablet breakpoints, touch + hover hybrid interaction |
| Android tablet | Chrome | Same as iPad, cross-vendor confirmation |

**Networks (where physically testable):** Fast Wi-Fi, normal 4G, slow
4G, 3G/high-latency — measuring first meaningful content, navigation
responsiveness, search responsiveness, map load, image load, and scroll
smoothness under each.

**What substituted for this in-session:** Chrome DevTools Protocol CPU
throttling (4×) and network condition emulation (~1.6Mbps/150ms latency,
a "Slow 4G" proxy) were attempted in the prior sprint but produced
unreliable results when combined with this environment's single-process
local file server (requests compounding into multi-minute waits
unrelated to the throttle itself) — abandoned in favor of the honestly-
labeled local, unthrottled measurements in §13–14, which is why this
plan exists as its own section rather than a claimed substitute.

---

## 20. Ticker governance

**IMPLEMENTED.**

Both marquee tickers (LIVE FX RATES, GLOBAL ANNOUNCEMENTS) now match the
map's existing pause discipline (§3.1):

- Pause when scrolled off-screen (`IntersectionObserver`, threshold 0.01).
- Pause when the browser tab is backgrounded (`visibilitychange` +
  `document.hidden`).
- Resume without a visible jump: implemented via a CSS class toggle
  (`.gpir-ticker-paused{animation-play-state:paused}`) rather than an
  inline style or a stop/restart — `animation-play-state:paused` freezes
  a CSS animation at its exact current position by definition, so there
  is no manual offset to track and no restart-from-beginning. Verified
  via `getAnimations()[0].currentTime` progressing continuously across a
  pause/resume cycle.
- Respect `prefers-reduced-motion` (pre-existing; the pause logic itself
  no-ops under reduced motion since the ticker is already static).
- The pre-existing hover-to-pause behavior on the FX ticker is
  unaffected — the class toggle never competes with the `:hover` rule
  the way an inline style would have.
- Each ticker's animation is now scoped to its own container ID
  (`#fx-ribbon` / `#market-ribbon`, §15) so this can never again silently
  cross-apply to the wrong ticker regardless of future CSS load order.

`initializeTickerVisibilityPause()` in `assets/js/script.js` runs on
every page (a harmless no-op where no ticker markup exists) so a future
page that adds its own ticker inherits this behavior automatically,
consistent with §31's "automate the check, don't rely on memory."

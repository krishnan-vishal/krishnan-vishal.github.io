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

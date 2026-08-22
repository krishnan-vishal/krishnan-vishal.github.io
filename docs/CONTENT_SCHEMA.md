# GPIR Structured Content Model

A common JSON shape for every content type GPIR publishes — country,
region, topic, payment rail, company/entity, corridor, regulation,
research, intelligence, dataset, and learning asset — designed to fit
the site's existing static HTML/JSON/vanilla-JS architecture with no new
dependency: no database, no knowledge graph, no build step.

**Status: foundation, not a migration.** As of Implementation 04, exactly
two real content objects exist under this model (one country, one
intelligence record — see §4), created to prove the model is compatible
with the existing rendering paths, not to replace them yet. See §6 for
what would need to happen before this becomes the site's actual data
source.

---

## 1. Design principle

One shared **envelope** (the fields every content type has in common)
wrapping a **type-specific payload** (the fields only that content type
needs). This is the same pattern the site already uses successfully —
`assets/data/announcements.json` records already separate common fields
(`id`, `title`, `status`, `source`) from intelligence-specific ones
(`gpirMapping`, `audit`, `sourceOrgId`) — this model generalizes that
pattern across all 11 content types instead of inventing something new.

A content object is never rendered directly by a generic renderer that
tries to handle all 11 types identically. Each content type keeps using
whatever existing rendering path already serves it well (a hand-authored
page, a generator script, a runtime `fetch()` into the DOM) — the
envelope's job is to be a common *source of truth shape* that an adapter
can convert into whatever shape that existing rendering path already
expects. See `scripts/content-object-adapter.js` and §5.

## 2. The envelope (common fields)

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable, unique, kebab-case. Prefixed by type for readability (`country-uae`, `intel-cbuae-payment-token-2026`). |
| `title` | string | Display title. |
| `slug` | string | URL-safe identifier used to build the canonical page path. |
| `summary` | string | One–two sentence summary — feeds card excerpts, meta descriptions, search results. |
| `description` | string \| null | Longer body text, where the content type has one. `null` when the canonical page itself is the description (e.g. a full country page). |
| `contentType` | enum | One of: `country`, `region`, `topic`, `paymentRail`, `entity`, `corridor`, `regulation`, `research`, `intelligence`, `dataset`, `learningAsset`. |
| `country` | string \| null | Country name, where applicable. |
| `region` | string \| null | Region/sub-region slug or name. |
| `topic` | string \| null | Top-level GPIR topic classification (mirrors the existing `gpirMapping.header` pattern in announcements.json). |
| `subtopic` | string \| null | Second-level classification (mirrors `gpirMapping.subHeader`). |
| `tags` | string[] | Freeform tags. |
| `publicationDate` | string (ISO date) \| null | First-published date. |
| `lastUpdated` | string (ISO date) \| null | Most recent substantive update. |
| `version` | integer | Starts at `1`. New field — no existing record shape had one; see §6. |
| `status` | enum | `PUBLISHED`, `DRAFT`, `PENDING_REVIEW`, `ARCHIVED`, `SUPERSEDED`. An adapter maps a type's own existing status vocabulary (e.g. announcements.json's `GPIR_CLASSIFIED`) to/from this common set — the common set is for cross-type queries, the original vocabulary keeps driving that type's own logic (e.g. the trust engine still reads its own fields, untouched). |
| `source` | object \| null | `{ name, tier, url }` — reuses the exact shape `assets/data/announcements.json` records already use. |
| `sourceUrl` | string \| null | Flattened convenience copy of `source.url`, for content types that cite a source without needing the full object (e.g. a dataset's origin). |
| `relatedContent` | string[] | Ids or hrefs of related content objects — generalizes the `relatedCountryHref` / `gpirMapping.href` / "related records" patterns already used ad hoc in different places today. |

Every field is optional except `id`, `title`, `contentType`, and
`status` — "where applicable" per the brief; a `region` object naturally
has no `country`, a `dataset` may have no `topic`.

## 3. Type-specific payload

Kept as a `typeSpecific` object so the envelope stays identical across
all 11 types. Two are populated today (see §4); the rest are reserved
shapes, sketched from the fields the closest existing data already
carries, not yet populated with real objects:

- **country** — `{ countryCode, flag, currencyName, currencySymbol, currencyCode, subRegion, dashboardUrl }` (mirrors `assets/data/*-countries.json` entries).
- **intelligence** — `{ organisation, eventType, category, subCategory, contentStatus, sourceOrgId, audit }` (mirrors `announcements.json` records).
- **region, topic, paymentRail, entity, corridor, regulation, research, dataset, learningAsset** — reserved; no real object exists yet, so no shape is finalized until a first real instance forces the real question ("what does a corridor object actually need") rather than guessing.

## 4. What exists today

Two real content objects, both derived from live, already-published data
— nothing fabricated:

- `assets/data/content/countries/uae.json` — `contentType: "country"`, built from the real `middle-east-countries.json` UAE entry, the real `world-map-countries.json` UAE marker, and `pages/countries/uae.html`'s own `<title>`/meta description.
- `assets/data/content/intelligence/cbuae-payment-token-2026.json` — `contentType: "intelligence"`, built from the real `announcements.json` record of the same id.

Full JSON Schema: `assets/data/content/schema/content-object.schema.json`.

## 5. Rendering path

Structured content in this model does not get a new renderer. It gets
converted, by a pure adapter function, back into the exact shape the
*existing* rendering path for that content type already consumes:

- **Country → the interactive world map.** `assets/js/world-map.js`
  fetches `world-map-countries.json` at runtime and renders one marker
  per entry (`{name, region, lat, lon, status, url}`). `toWorldMapEntry()`
  in `scripts/content-object-adapter.js` converts the unified UAE object
  into that exact shape. Verified: the adapter's output is field-for-field
  identical to the real, live UAE entry already in
  `world-map-countries.json` — the world map would render UAE's marker
  identically whether it read the old entry or the adapter's output.
- **Intelligence → the static-page generator.** `toAnnouncementRecord()`
  converts the unified object back into the exact record shape
  `scripts/generate-intelligence-pages.js` consumes. Verified two ways:
  (a) field-for-field identical to the real, live `announcements.json`
  record, and (b) an isolated regeneration run (scratch copy of the
  generator, scratch paths, the adapter-derived record substituted for
  the real one, every other record left untouched) produced HTML
  byte-for-byte identical to the currently-published
  `pages/intelligence/cbuae-payment-token-2026.html`. See Implementation
  04's completion report for the exact diff command and result.

Neither `world-map.js` nor `generate-intelligence-pages.js` was modified
to perform this proof — both were exercised read-only or against scratch
copies, per "prove... without disturbing the existing design."

## 6. Migration implications — what this is not, yet

This foundation does **not** currently drive any live page. Making it the
real source of truth would mean, for each content type separately and
incrementally:

1. Pointing the relevant existing script/engine at the unified object
   store instead of (or as well as) its current data file — e.g.
   `world-map.js` fetching from `assets/data/content/countries/*.json`
   merged into the marker list, or `generate-intelligence-pages.js`
   reading `assets/data/content/intelligence/*.json` instead of
   `announcements.json`.
2. Deciding, per type, whether the *existing* data file
   (`announcements.json`, `*-countries.json`) becomes generated *from*
   the unified store, or is retired in favour of it — not both being
   hand-maintained in parallel long-term, which would immediately
   reintroduce the two-sources-of-truth risk this model exists to avoid.
3. Backfilling real objects for the other 9 content types as real
   content of those types is authored — not speculatively, per the
   "progressive... only ONE representative" instruction this task was
   scoped to.

None of that is done here. This task proves the model is *compatible*
with the existing architecture; adopting it as the live source of truth
for any given type is a separate, later decision.

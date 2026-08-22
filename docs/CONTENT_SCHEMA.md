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

---

## 7. Relationships (Implementation 05)

**Why not a graph database.** The relationship need here is small and
enumerable (a controlled vocabulary of ~25 edge types, a content set in
the hundreds not millions), and the site has no server to host a graph
engine even if one were justified. A typed edge list embedded in each
JSON object, plus one small generated reverse-index file, covers the
same need with zero new infrastructure — consistent with §1's "simplest
architecture" principle and Implementation 04's "no database, no
knowledge graph" constraint.

**Shape.** Each content object gets a `relationships` array (see the
JSON Schema, `content-object.schema.json`) of directed edges:

```json
{ "type": "Country->Regulator", "targetId": "entity-cbuae", "targetType": "entity" }
```

`type` is one of the controlled vocabulary strings below. `targetId` is
another content object's `id`. `targetType` is a denormalized copy of
the target's `contentType`, so a consumer doesn't have to resolve the
target just to know what kind of thing it is.

This is a **second, additive** relationship layer alongside the
`relatedContent` href array Implementation 04 already established.
`relatedContent` stays exactly as it was — it's what the adapter's
`toAnnouncementRecord()` reads to reconstruct `relatedCountryHref`
losslessly, and changing its meaning would break that already-verified
proof. `relationships` is the new, typed, queryable layer for
cross-content graph-style questions; the two are allowed to overlap in
practice without being forced into one shape.

**Controlled vocabulary** (exactly the 24 edge types this prompt named,
plus the `Country->Currency` clarification below — nothing added,
nothing renamed):

```
Country -> Region            Company -> Country           PaymentRail -> Country
Country -> Currency          Company -> PaymentRail        PaymentRail -> Region
Country -> PaymentRail       Company -> Corridor           PaymentRail -> Company
Country -> Company           Company -> Research           PaymentRail -> Corridor
Country -> Regulator
Country -> Corridor          Research -> Country           Regulation -> Country
Country -> Research          Research -> Topic             Regulation -> Regulator
Country -> Regulation        Research -> Company           Regulation -> PaymentRail
                              Research -> PaymentRail        Regulation -> Company
                              Research -> Corridor
```

Two vocabulary clarifications, made explicit rather than silently
papered over:

- **`Country -> Currency` is modeled as an attribute, not an edge to a
  separate content object.** Implementation 04's 11 content types do not
  include "currency" as a type — a currency is `typeSpecific.currencyCode`
  /`currencyName`/`currencySymbol` on the country object itself (already
  present on `uae.json`). Introducing a twelfth content type for this
  would go beyond what Implementation 04 established without a real
  driving need — currencies don't have their own pages, summaries, or
  publication history the way the other 11 types do.
- **"Regulator" is a role, not a distinct content type.** The 11 types
  list has "company/entity" as one type. A regulator (e.g. the Central
  Bank of the UAE) is an `entity` object with `typeSpecific.entityRole:
  "regulator"` rather than "company" — same shape, same rendering-path
  questions, different role. `Country -> Regulator` and `Regulation ->
  Regulator` both target `entity` objects.
- **The "Research" vocabulary also covers `intelligence` objects.** The
  11 types list `research` and `intelligence` separately (an
  intelligence record is a dated event/announcement; research is
  longer-form analysis), but the prompt's relationship vocabulary only
  names "Research". `Research -> X` edges from an `intelligence` object
  use the same vocabulary rather than inventing a parallel
  `Intelligence -> X` set the prompt didn't ask for.

**What's populated vs. vocabulary-only.** Following the same honesty
standard Implementation 04 used for the 9 unpopulated content types:
real relationships were only added where they connect to real,
already-published site content — nothing was invented to fill out the
vocabulary list. As of Implementation 05:

*Populated with real edges* (UAE/CBUAE pilot cluster):
`Country->Region`, `Country->Regulator`, `Country->Regulation`,
`Country->PaymentRail`, `Country->Research`, `Regulation->Country`,
`Regulation->Regulator`, `Research->Country`, `Research->Topic`,
`PaymentRail->Country`, `PaymentRail->Region`.

*Vocabulary-defined, no real instance yet* (would need a real Company,
Corridor, or Dataset object to populate honestly — none exists in the
site's structured-content set as of this implementation):
`Country->Currency` (see clarification above — deliberately never
populated as an edge), `Country->Company`, `Country->Corridor`,
`Company->*` (all four), `PaymentRail->Company`, `PaymentRail->Corridor`,
`Research->Company`, `Research->PaymentRail`, `Research->Corridor`,
`Regulation->PaymentRail`, `Regulation->Company`.

**Reusability — the actual point of this exercise.** The prompt's own
example: a Vietnam payment-development object shouldn't need separate
copies for Vietnam, APAC, RTP, B2B, and its corridor — it should relate
to existing objects for each of those instead. This is demonstrated
concretely with real data rather than a hypothetical: `region-middle-east`
and `entity-cbuae` are each real, single objects, but multiple *other*
objects (`country-uae`, `paymentrail-aani-uae-ipp`, `regulation-cbuae-
payment-token-services`) all relate *to* them rather than embedding a
copy of the region's or the regulator's data. `assets/data/content/
relationships-index.json` (generated by `scripts/generate-relationships-
index.js`, never hand-edited) makes this multi-context reuse visible: it
lists, for every object, both its own outbound edges and the *inbound*
edges computed by scanning every other object — for `region-middle-east`
that inbound list currently has two independent sources
(`country-uae`, `paymentrail-aani-uae-ipp`), proof the same object is
already serving two different contexts without duplication.

---

## 8. Evidence and version metadata (Implementation 06)

Two new optional envelope objects, both null/empty by default:
`evidence` (research provenance) and `versionInfo` (lightweight content
lifecycle).

### 8.1 `evidence`

| Field | Notes |
|---|---|
| `sourceName` | The specific named publication/document -- e.g. "Payment Token Services Regulation -- CBUAE Rulebook". Distinct from... |
| `sourceOrganisation` | ...the organisation that issued it -- e.g. "Central Bank of the UAE (CBUAE)". Both already existed informally as one merged field (`source.name`) since Implementation 04; this formalizes the real distinction the data already had. |
| `sourceType` | One of `PRIMARY`, `REGULATORY`, `MULTILATERAL`, `INDUSTRY`, `COMPANY`, `SECONDARY`, `OTHER`. |
| `evidenceType` | One of `FACT`, `DATA`, `ANALYSIS`, `ESTIMATE`, `FORECAST` -- see the fact-vs-analysis note below. |
| `referencePeriod` | The bounded period a data point applies to, only where real evidence supports one. |
| `retrievalDate` | When GPIR retrieved the source. |
| `verificationStatus` | Reuses the site's existing trust-engine vocabulary (`SOURCE_VERIFIED` / `SOURCE_WARNING` / `SOURCE_REQUIRES_VERIFICATION` / `SOURCE_BLOCKED`) -- the exact enum `assets/js/trust-engine.js` and `generate-intelligence-pages.js`'s `evaluateSource()` already compute. Deliberate non-duplication: a competing vocabulary here would violate the guardrail doc's "must not be duplicated" rule for that system. |
| `lastReviewed` | Most recent human/system review date. |
| `analysisFields` | Names the specific fields on this same object that are FINTECHOISIS's own analysis rather than sourced fact -- see below. |

**Fact vs. analysis within one object.** Reviewing the real
`intel-cbuae-payment-token-2026` pilot object surfaced a genuine nuance:
its `summary` field is a direct factual restatement of what the primary
source says, but its `description` field (ported from the original
record's `whyItMatters`) is FINTECHOISIS's own interpretive commentary --
why the regulation matters, not what the regulator said. These are
different evidentiary natures inside the same content object. Rather
than forcing a second content object to exist just to hold one sentence
of commentary, `evidenceType` classifies the object's core claim (here,
`FACT` -- a regulation genuinely went operational, verifiably) and
`analysisFields: ["description"]` flags which field is FINTECHOISIS's
own analysis layered on top. The presentation component (§9) uses this
to render the two differently without a heavier content model.

**"Do not automatically classify existing content if evidence is
insufficient" -- applied, not just stated.** Of the 7 content objects
that exist as of Implementation 06, exactly 3 got a populated `evidence`
block, because exactly 3 share the same real, tier-1, already-verified
source (the CBUAE Payment Token Services Regulation and the Central Bank
of the UAE itself):

| Object | `evidence` | Why |
|---|---|---|
| `intel-cbuae-payment-token-2026` | Populated | Real tier-1 source (`rulebook.centralbank.ae`), and `verificationStatus: SOURCE_VERIFIED` is not a guess -- it's the literal, already-computed output the real `generate-intelligence-pages.js` printed when it generated this record's page (`source status: SOURCE_VERIFIED`), cited rather than re-derived. |
| `regulation-cbuae-payment-token-services` | Populated | Same real source and registry entry as above. |
| `entity-cbuae` | Populated | Same registry entry (`trusted-sources.json`'s real `cbuae` record, tier 1). |
| `country-uae` | Left null | A country profile aggregates many facts; it isn't itself evidenced by one external publication. Picking an arbitrary "representative" source wouldn't actually characterize the whole object. |
| `region-middle-east` | Left null | An internal GPIR editorial/navigational grouping, not an externally-sourced claim. |
| `topic-stablecoins-cbdcs` | Left null | Same -- an internal taxonomy node mapping to a chapter, not itself a sourced claim. |
| `paymentrail-aani-uae-ipp` | Left null | Built from GPIR's own existing editorial content (the UAE country page and RTP directory chapter), not a captured external primary-source citation with a URL -- inventing one to fill this field would violate "do not invent source information." |

No existing page's factual content was changed anywhere in this process.

### 8.2 `versionInfo`

```json
{ "supersedes": null, "supersededBy": null }
```

Set to this default (both null) on every one of the 7 objects -- safe to
apply universally, unlike `evidence`, because it's not asserting
anything; it's recording the absence of a superseding relationship,
which is true and known for all 7. Git history remains the record of
every edit to every file. This field answers a different, narrower
question git can't: "is there a newer or older content object
representing the same thing" -- relevant once a regulation is amended, a
country profile is substantially rewritten, or a research object is
updated with a later dataset, none of which has happened yet in this
project.

## 9. Reusable source/evidence presentation component

`assets/css/source-evidence-badge.css` + `assets/js/source-evidence-
badge.js` -- a small, optional renderer (`renderSourceEvidenceBadge(obj,
container)`) that takes any content object with a populated `evidence`
block and renders: a compact pill (`sourceType · evidenceType`, e.g.
"REGULATORY · FACT"), the source name/organisation, and -- only when
`analysisFields` is non-empty -- a visually distinct "FINTECHOISIS
Analysis" note beneath whichever field it names. Styled entirely from
`assets/css/variables.css` design tokens (no new colours, no new type
scale) so it reads as part of the existing design system rather than a
new one, and stays a small pill/note rather than a heavy panel, per "the
website should clearly distinguish factual source material from
Fintechosis analysis without making the interface visually heavy."

Not wired into any live page -- see `_demo/source-evidence-badge-
demo.html` (excluded from the public build by the same underscore-prefix
Jekyll convention Implementation 02 established) for a rendered,
inspectable proof using the 3 real classified objects, without touching
production per "preserve existing design."

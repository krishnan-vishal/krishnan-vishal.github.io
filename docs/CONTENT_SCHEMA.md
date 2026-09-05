# GPIR Content Schema

This document defines the contract for structured intelligence content in the
current static GPIR repository. It describes the JSON model that already feeds
the ticker, detail views, search relationships and generated intelligence pages.
It does not imply a database, API or ingestion service.

## Content-factory vocabulary

**File:** `assets/data/content-model.json`

The content-factory contract defines shared vocabulary for future records across
countries, regions, corridors, payment systems, regulatory bodies, entities,
intelligence events, announcements, sources and evidence. It also defines the
evidence classifications `FACT`, `DATA`, `ANALYSIS`, `ESTIMATE` and `FORECAST`,
plus explicit verification, readiness and reconciliation states.

This is a build-time contract only. Existing datasets remain authoritative for
their current presentation surfaces, and no placeholder record is published
merely because the vocabulary supports it. Source URL, publication date and
retrieval date requirements apply when those facts exist and have been checked.

Dashboard metadata is defined in the same contract for future data migration:
country, direction, use case, period, currency, volume, corridor, source,
evidence, last updated and methodology. Existing dashboard presentation remains
unchanged until a separately authorised data migration proves parity.

**File:** `assets/data/dashboard-metadata.json`

This build-time reader metadata covers the five existing homepage dashboard
cards. It records only the title, country, region, edition, status, description,
image path and country-page path already present in those cards. Period,
direction, use case, metric, unit, source, methodology and disclaimer are
explicitly `null` because they are not present in the existing dashboard
metadata. The reader must display those fields as unavailable rather than infer
them. The empty files under `pages/dashboards/` remain placeholders and are not
treated as published dashboard pages.

## Announcements dataset

**File:** `assets/data/announcements.json`

The document has this shape:

```json
{
  "schemaNote": "...",
  "lastRefreshed": "2026-08-14T00:00:00Z",
  "records": []
}
```

`lastRefreshed` records when the static dataset was last checked by the
editorial refresh process. It is not a claim that the site has a live feed.

### Record contract

| Field | Required | Meaning |
|---|---:|---|
| `id` | yes | Stable lowercase identifier used by generated page URLs. |
| `status` | yes | Editorial lifecycle state. Public records use `GPIR_CLASSIFIED`; `PENDING_HUMAN_REVIEW` and `SOURCE_VERIFICATION_REQUIRED` stay out of the ticker. |
| `title` | yes | Full intelligence record title. |
| `tickerHeadline` | yes for published records | Short display title for the ticker and related links. |
| `category`, `subCategory`, `eventType` | yes | Existing GPIR taxonomy labels. Do not add synonyms merely to fill a field. |
| `country`, `countryCode`, `region` | yes | Geographic classification. `countryCode` is the lowercase flag filename code when applicable; global records may use `null`. |
| `publishedDate` | yes | Original source publication date in `YYYY-MM` or `YYYY-MM-DD` form, or `null` when verification is pending. Never overwrite it when correcting a record. |
| `retrievedDate` | yes | Date GPIR retrieved or checked the cited material. |
| `sourceOrgId` | yes for a cited source | ID in `assets/data/trusted-sources.json`; `null` when verification is pending. |
| `source` | required for published records | Named publication, title and URL for the evidence used; `null` when verification is pending. |
| `contentStatus` | yes | GPIR review status, currently `CONTENT_VERIFIED` or `CONTENT_UNDER_REVIEW`. |
| `audit` | yes | `discoveredDate`, verification dates and `correctionHistory`. |
| `organisation` | yes for published records | Entity the development concerns; it may differ from the publishing source. It may be `null` while verification is pending. |
| `lastUpdated` | yes | `null` unless a published record has been materially revised. |
| `summary` | yes for published records | Evidence-based summary written from the cited material. |
| `whyItMatters` | recommended | Clearly labelled GPIR interpretation, separate from the factual summary. |
| `gpirMapping` | recommended | Existing chapter relationship with a repository-relative `href`. |
| `relatedCountryHref` | optional | Existing country-page relationship or `null`. |

Dates are calendar dates, not guessed timestamps. URLs must be HTTPS and must
be traceable to the named source. A missing or unverified source is represented
explicitly and is never replaced with a placeholder URL.

## Source registry

**File:** `assets/data/trusted-sources.json`

Each registry entry has a stable `id`, a named organisation, one or more
`officialDomains`, a numeric trust `tier`, and a `sourceType`. The runtime trust
engine compares the hostname of a record's URL with these domains. Registry
membership is a domain ownership check, not a claim that every page on that
domain is correct.

## Publishing rules

1. Only `GPIR_CLASSIFIED` records can generate public ticker cards and static
   intelligence pages.
2. High-risk or unresolved material remains pending human review.
3. `SOURCE_VERIFIED` requires a registry match, HTTPS, and no detected
   lookalike-domain flags. Source trust does not equal content verification.
4. A correction updates `lastUpdated` and appends to `audit.correctionHistory`;
   it does not silently change the original publication date.
5. New records must use real evidence. Fabricated dates, quotes, URLs,
   organisations, market data or regulatory claims are not valid content.

The dev-time contract check is `node scripts/validate-content.js`.

## Canonical content registry

**File:** `assets/data/content-registry.json`

The registry is a lightweight catalog of canonical content identities. It is
not a second copy of country or intelligence prose. Each record has a
namespaced `id`, `contentType`, `title`, `slug`, `status`, a `sourceRef` into
an existing JSON dataset, optional generated `page`, `sourceRefs`, and typed
`relationships` to other registry IDs.

The pilot supports the full planned vocabulary without requiring every type
to be populated: `COUNTRY`, `REGION`, `ENTITY`, `REGULATOR`, `LICENCE`,
`PAYMENT_RAIL`, `WALLET`, `BANK`, `MTO`, `FINTECH`, `CORRIDOR`, `REGULATION`,
`RESEARCH`, `INTELLIGENCE`, `ANNOUNCEMENT` and `SOURCE`.

The current pilot indexes five existing active countries (United Arab Emirates,
India, Saudi Arabia, Qatar and Singapore), their regions, four verified source
identities (CBUAE, SPA, RBI and MAS), and four source-backed announcement and
intelligence pairs. Announcement and intelligence entries may point to the same
canonical announcement record because they represent two existing presentation
surfaces, not duplicated substantive content. Countries are added to the
registry only when both the structured directory record and the published page
already exist.

The registry is currently a validated build-time catalog. Runtime pages do not
load it globally, so the pilot adds no initial page payload. A future
generator may consume it only after the registry contract and migration pilot
are extended and validated.

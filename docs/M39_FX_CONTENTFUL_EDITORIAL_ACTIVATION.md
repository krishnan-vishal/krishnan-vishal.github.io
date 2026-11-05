# M39-FX Contentful editorial activation review

Date: 2026-11-05  
Working branch: `codex/m39-fx-production-closure`  
Baseline: `origin/main` at `20b420ce9395a2f5b4f2b252738299c1b853555b`

## Decision

`NO_APPROVED_PAIR_SPECIFIC_PUBLICATION`

M35 Contentful delivery build #5 was inspected from its authenticated GitHub
artifact. The archive SHA-256 is
`ec878ca61f577c0c1a40bf938fb1ebdee69d9ca850f3fde2059e729caf957125`, matching
the digest recorded by GitHub for artifact `m35-contentful-delivery`. The
artifact contains 35 delivered `gpirPublication` records and an empty
`.generated/m39/fx-editorial-public.json`.

None of the 35 records explicitly attributes editorial research to `USD/JPY`
or `USD/SGD`. There is no Japan-specific publication in the delivered estate.
The closest apparent candidate is the Singapore country publication:

- Contentful entry ID: `79IwPy4ChfJ04brzBF2BNS`
- GPIR publication ID: `VK-GPIR-P-000000000002-6`
- Title: `Singapore | GPIR Country Intelligence | FINTECHOISIS`
- Canonical candidate: `/singapore-gpir-country-intelligence-fintechoisis/`
- Business publication status: unresolved (`null`)
- Validation status: `WARN`
- Public access classification: unresolved (`null`)
- Source state: `SOURCE_VERIFICATION_PENDING`, `DATA_UNDER_DEVELOPMENT`

That entry discusses Singapore's exchange-rate-centred monetary framework at a
general country level. It contains no explicit `USD/SGD` attribution or
pair-specific analysis, so renaming or exporting it would be misleading. The
other term matches in the estate are similarly general references to foreign
exchange or monetary policy and do not qualify as pair research.

Production `assets/data/fx/editorial-public.json` and build #5 therefore
correctly remain at zero exported records. No draft, authenticated or premium
Contentful material was copied into the public index.

## Review-ready USD/JPY draft

The companion file
[`M39_FX_USD_JPY_CONTENTFUL_REVIEW_DRAFT.json`](M39_FX_USD_JPY_CONTENTFUL_REVIEW_DRAFT.json)
contains a review-only field mapping for the existing `gpirPublication` model.
It is not an API request and is not publish-eligible. It deliberately leaves
the following authoritative values unresolved:

- `gpirPublicationId`
- `editionLineageId`
- `supabaseRecordId`
- `publicationStatus`
- `publicationDate`
- presentation `accessClass`

The proposed title explicitly identifies `USD/JPY`. The draft separates ECB/
GPIR reference observations from editorial analysis, records the observation
window without reproducing dashboard calculations, and does not infer that a
central-bank decision caused a particular rate move.

## Verified research basis

1. **Bank for International Settlements — Triennial Central Bank Survey, OTC
   foreign exchange turnover in April 2025.** Published September 2025. The
   survey reports USD/JPY at 14.3% of global OTC FX turnover in April 2025 and
   explains the risk-management roles of forwards and FX swaps.
   <https://www.bis.org/statistics/rpfx25_fx.pdf>
2. **Bank of Japan — Statement on Monetary Policy.** Published 30 October
   2026. The statement sets the guideline for the uncollateralized overnight
   call rate at around 1.25% for the intermeeting period.
   <https://www.boj.or.jp/en/mopo/mpmdeci/mpr_2026/k261030a.pdf>
3. **Federal Reserve — FOMC statement.** Published 28 October 2026. The
   statement maintains the federal funds target range at 3.75%–4.00%.
   <https://www.federalreserve.gov/newsevents/pressreleases/monetary20261028a.htm>
4. **European Central Bank — official daily euro foreign-exchange reference
   series.** Retrieved 5 November 2026; observations used by GPIR run through
   4 November 2026. GPIR derives USD/JPY only from same-date official EUR/USD
   and EUR/JPY observations and labels the result `derived-cross`.
   <https://data-api.ecb.europa.eu/service/data/EXR/D..EUR.SP00.A>

The BIS market-share figure is structural context from April 2025, not a 2026
rate observation. The BOJ and Federal Reserve decisions are verified policy
facts and relevant context, but their coexistence does not establish causality
for any USD/JPY movement. ECB values remain reference rates rather than
transaction or executable prices.

## Approval and activation gates

Before any Contentful write or publication, the GPIR owner and designated data
authorities must:

1. review and approve the editorial wording and every cited claim;
2. allocate the governed publication and lineage IDs;
3. create the matching authoritative Supabase publication identity row and
   supply its UUID as `supabaseRecordId`;
4. approve the `CURRENT` business lifecycle value under the M35 contract;
5. approve a publication date and the proposed canonical route;
6. authorize the presentation as `PUBLIC` in the existing presentation
   manifest/process;
7. create the Contentful Draft, read it back, and approve/publish it through the
   existing editorial process;
8. make the canonical publication page accessible before the FX index links to
   it.

There is also a pre-existing contract discrepancy to resolve at the release
gate: `build-fx-editorial-bridge.js` currently tests for
`publicationStatus === "PUBLISHED"`, while the authoritative M35 schema permits
only `CURRENT`, `HISTORICAL`, or `null`; Contentful Delivery API visibility is
the separate technical publication signal. This review does not change or
weaken that filter. The owner must approve a contract-aligned correction before
a valid `CURRENT` record can export.

After those gates, rerun `M35 Contentful publication build` in `delivery` mode
with the actual governed count, verify exactly the approved pair record in
`.generated/m39/fx-editorial-public.json`, promote that generated file to
`assets/data/fx/editorial-public.json` through the normal reviewed GitHub
branch/PR deployment path, and verify the USD/JPY card's **Economic & Policy
Drivers** section. No workflow dispatch, Contentful write, approval,
publication, index promotion, merge, or production deployment occurred in this
review.

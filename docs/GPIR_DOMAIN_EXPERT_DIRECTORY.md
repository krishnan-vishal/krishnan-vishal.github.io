# GPIR Domain Experts and Global Leaders

## Reader and editorial evidence

| Surface | Contract |
| --- | --- |
| Navigation | Repository → Directory → Domain Experts & Global Leaders on the homepage and Intelligence Observatory. The existing Industry Participants chapter remains linked. |
| Reader eligibility | The existing Supabase subscriber resolver checks the session, payment entitlement and confirmed GPIR admin access. Guest and unpaid responses contain no profile, facet or count. |
| Evidence | Each editorial identity is a private, versioned Payload Editorial Metadata record. A release requires documented identity, 10+ years of evidence, sourced career and executive brief, independently sourced contribution, recorded publication and sanctions review, explicit owner approval and a current review date. Optional qualifications and recognition use the same sourced-claim shape. |
| Distribution | An admin explicitly syncs the approved reader projection into GPIR Core. GPIR Core rejects stale and conflicting revisions. Archive sync withdraws the projection. The reader RPC stops returning expired releases even if no new sync occurs. |
| Accessibility | WCAG 2.2 AA design target. Skip navigation, labeled native controls, visible focus, expandable native sections, announced results, focus restoration and responsive reflow. Complete keyboard, screen-reader, contrast and zoom acceptance on a deployed preview. |
| Initial inventory | 13 distinct owner-brief candidates parsed in a dry run. No imported production records or published profiles verified. Candidate and editorial claims must be verified individually. Expansion toward 500 remains an editorial discovery and verification effort. |

## Validation recorded on the feature branch

The isolated GPIR-M35-RUNTIME-TEST PostgreSQL 17 check passed privilege separation, combined filters, projection redaction, pagination, expiry, idempotent sync, stale revision rejection and archive withdrawal. The temporary schema was rolled back and confirmed absent. The local browser runtime did not start, so rendered accessibility acceptance remains pending.

## Owner-reviewed rollout

1. Use the recorded isolated migration acceptance as the release baseline. Repeat it if migration SQL changes.
2. After approval, apply the Core migration, deploy the existing source-directory Edge Function with its new catalog option, and deploy the Payload editor and release endpoint via the existing pipelines. The Core connection uses the existing `GPIR_CORE_SUPABASE_URL` and `GPIR_CORE_SUPABASE_SECRET_KEY` configuration. Keep CMS and Core credentials server-side.
3. Run `python scripts/import-domain-expert-brief.py PATH_TO_APPROVED_BRIEF.docx` for a dry run. To stage the private REVIEW records, supply the approved Payload origin in `PAYLOAD_PUBLIC_SERVER_URL` and an editor session JWT in `GPIR_PAYLOAD_EDITOR_TOKEN`, then add `--stage`. Re-running the importer preserves previously reviewed records.
4. For each candidate, verify sources and clearance in Editorial Metadata. The Payload validation field contract is in `apps/gpir-cms/src/lib/domain-expert.mjs`. Document approval and sanctions screening scope. Set state to PUBLIC in Payload only after clearance. Call the admin-only `POST /api/release/domain-expert` with `{"id":"gpir-expert:<canonical suffix>"}`. To withdraw, set state to ARCHIVED and sync the same identity. Retain the Payload record and its version history. Only an explicit, successful sync changes reader delivery.
5. Verify guest, signed-in unpaid, subscriber and confirmed admin states on the deployed route. Test the site's existing menu on desktop and mobile. Check the empty state, pagination, a sourced card, visible focus and keyboard-only selection. Confirm that source directories and the Industry Participants chapter still work.
6. Review published identities at least annually and when their role, evidence or permissions change. Record dated corrections in Payload and resync. For release rollback, restore the prior frontend and Edge bundle through existing review gates. Archive and sync any projection that must be withdrawn.

The intended reader route is [Domain Experts & Global Leaders](https://fintechoisis.com/pages/intelligence/domain-experts.html). Treat it as a proposed route until the reviewed release is deployed.

## First 50 verified profiles — source routing

Start with GPIR's existing institution and topic coverage. Maintain the source URL against the specific person and claim in Payload. A site approved for intelligence discovery does not automatically verify a profile or its claims. Candidate discovery is repeatable; identity reconciliation, source independence and publication clearance are editorial decisions.

| First-cohort target | Public discovery platforms | Claim-level evidence to collect |
| --- | --- | --- |
| 15 central-bank and payments-policy experts | [BIS CPMI governance](https://www.bis.org/committees/cpmi/governance), [RBI governors](https://rbi.org.in/Scripts/governors.aspx), [Banco Central do Brasil](https://www.bcb.gov.br/en/about/orgstructure), and the corresponding GPIR national central-bank links | Official appointment or biography plus a dated committee role, policy report or speech archive. Include treasury, liquidity, settlement and instant payments. |
| 10 multilateral and development-finance experts | [IMF leadership](https://www.imf.org/annual-report/2026/who-we-are/executive-directors-and-management-team/), [World Bank leadership](https://www.worldbank.org/ext/en/who-we-are/leadership), [ADB management](https://www.adb.org/about/management) | Prior appointments and named work on remittances, inclusion or market infrastructure. Check past roles against the prior institution. |
| 10 financial-crime and regulatory experts | [FATF Presidency](https://www.fatf-gafi.org/en/the-fatf/fatf-presidency.html), [FSB supervisory committee](https://www.fsb.org/about/organisation-and-governance/members-of-standing-committee-on-supervisory-and-regulatory-cooperation/), national regulators and FIUs | Dated role history and named involvement in standards, financial-crime policy or supervision. Use Treasury/UN appointment and testimony records when they substantiate a claim. |
| 15 industry leaders and founders | [Swift executive committee](https://www.swift.com/about-us/organisation-and-governance/executive-committee?tl=en), [NPCI board](https://www.npci.org.in/board-directors), issuer investor relations and [SEC EDGAR](https://www.sec.gov/edgar/search/) | Dated role and tenure from the operator and its filings, plus a distinct source for the person's contribution such as a regulator, counterparty or official hearing record. An issuer-authored filing is still that issuer's account. |

Assign each person to one primary cohort and keep additional topics as tags. Cover Africa, GCC/Middle East, Europe, Americas and Asia-Pacific through the existing GPIR regional network. For the 50-profile target, plan to research 70–80 candidates including the 13 supplied, with reserves by cohort. Count distinct live, cleared profiles only. Apply the same process for cumulative targets of 100, 200 and 500.

**Credentials and identity.** Prefer a public source from the awarding university, professional body or licence issuer. Use organization-asserted [ORCID claims](https://info.orcid.org/interpreting-the-trustworthiness-of-an-orcid-record/) when the organization and identity match. An official employer biography may support a qualification with attribution to the employer. Omit qualifications without credible public evidence. Treat LinkedIn, conference bios repeated from the speaker and self-asserted ORCID material as discovery leads. Match full name, employer, jurisdiction and dates before reconciling similar names.

**Publication checks.** Keep claims and source evidence in the existing Payload record with publisher, URL, dated role or claim, capture date and coverage. Capture the official [OFAC](https://sanctionssearch.ofac.treas.gov/) and [UN Consolidated List](https://main.un.org/securitycouncil/en/content/un-sc-consolidated-list) scope and check date in the private editorial record. Escalate possible identity matches for resolution. Use initials by default. Record independent corroboration for the specific contribution before release. Preserve the source URLs with the published claims.

**Example evidence pairs.** Andréa M Maechler's [BIS biography](https://www.bis.org/author/andrea-m-maechler) and dated [Swiss National Bank biography](https://www.snb.ch/dam/jcr%3A588f28a1-9486-4abf-84e7-0fb29e649430/hist_bios_dm_maechler.en.pdf) support her career timeline and Global Foreign Exchange Committee chair role. Andrew Bailey's [Bank of England biography](https://www.bankofengland.co.uk/about/people/andrew-bailey/biography) and [FSB profile](https://www.fsb.org/profile/andrew-bailey/) support separate role histories. These are evidence leads; both still require all editorial clearance checks.

## Forward editorial pilot — 23 November 2026

- The directory is built prospectively. Past appointments and publications can substantiate a professional sketch. Publish and verification dates reflect the actual editorial action.
- The same entitled directory provides two views. **Key figures by domain** starts with published expertise topics and opens the relevant verified profiles. **Professional profiles** provides the A–Z directory, filters and source-linked career sketches. The domain view uses only topics from the published projection.
- Select for documented influence in the relevant domain: institutional leadership, ownership of a recognized initiative or standard, or independent recognition with a retrievable source. Employer-scale rankings can be recorded with the issuer and year. Individual influence claims need evidence specific to the person. No editorial ranking or publisher affiliation is implied.
- The first live batch is a two-person editorial pilot toward the 50-profile milestone. Confirm current role, a dated career timeline, an independently documented contribution and all existing publication clearance per person. Review public LinkedIn through ordinary public pages. Use employer or issuing-institution records to substantiate specific claims and omit personal URLs where identity cannot be reconciled.

| Pilot candidate | Domain placement | Source evidence |
| --- | --- | --- |
| Andréa M Maechler | FX market standards, central banking | The [BIS biography](https://www.bis.org/author/andrea-m-maechler) supports her deputy general manager appointment, institutional roles and education. The [SNB biography](https://www.snb.ch/dam/jcr%3A588f28a1-9486-4abf-84e7-0fb29e649430/hist_bios_dm_maechler.en.pdf) documents tenure and past roles. The [GFXC announcement](https://www.globalfxc.org/press-releases/press-p211217/) confirms selection as Chair. The [public LinkedIn profile](https://ch.linkedin.com/in/amaechler) corroborates the BIS identity. |
| Andrew Bailey | Financial stability, cross-border payments policy | The [Bank of England biography](https://www.bankofengland.co.uk/about/people/andrew-bailey/biography) and [official CV](https://www.bankofengland.co.uk/-/media/boe/files/about/people/andrew-bailey/cv.pdf) support the career history and education. The [FSB governance page](https://www.fsb.org/about/organisation-and-governance/) confirms the chair role, and the [FSB summit record](https://www.fsb.org/2026/03/fsb-kicks-off-new-implementation-phase-to-enhance-cross-border-payments-through-public-private-partnership/) documents his contribution to the G20 cross-border payments agenda. A personal LinkedIn link remains unconfirmed. |

Both candidates have supporting public evidence. Editorial clearance, controlled release and live verification are still required. Use sourced text and initials while image rights remain unverified.

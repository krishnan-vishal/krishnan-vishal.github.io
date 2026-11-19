# GPIR proposed source expansion — review queue (19 November 2026)

**Status: CANDIDATES ONLY.** This file does not authorize ingestion, source_registry activation, historical import, redistribution, or publication. Existing source approval, copyright/robots/terms, 95% confidence, provenance, date validation and dedupe remain binding. A marketing landing page is not an archival API.

| Candidate | Proposed coverage | Review starting URL | Ingestion class |
|---|---|---|---|
| Convera | FX, cross-border B2B payments | https://convera.com/en-sg/about-us/company-news/ | Corporate announcements, independently corroborate |
| GlobalData / Celent | Wallet market research | https://globaldata-26632421.hs-sites-eu1.com/what-will-define-next-phase-digital-wallet-market | Webinar/marketing landing page; metadata only until licensed |
| FinTech News Singapore | APAC events and ecosystem | https://fintechnews.sg/singapore-fintech-festival-2026/ | Event/reporting, date-checked |
| Global AI Leaders | AI in financial services (topic qualification required) | https://www.globalaileaders.com/ | Source credibility and finance relevance review |
| Monito | Cross-border FX and remittance comparisons | https://www.monito.com/ | FX methodology, timestamp and licensing review; **not** an authoritative FX rate feed |
| ComplyAdvantage | AML, sanctions, fraud and compliance | https://complyadvantage.com/insights/ | Vendor insights, cross-check official regulators |
| NextGen Nordics | Nordic fintech events | https://www.nextgennordics.com/ | Events, not continuous news feed |
| The Paypers | Payments, fraud, regulatory news | https://thepaypers.com/news | Publisher news; source terms and permitted feed access review |

## Acceptance — existing ingestion and backfill only

1. Register each candidate with unique canonical domain, permitted access mechanism, topic taxonomy, primary/secondary status and terms evidence. No automatic approval from this document.
2. Test one bounded, dated source item through existing source_registry → candidate → evidence → confidence >=95 → approved announcement → M40 API. Keep 12-hour live relay and archive distinct.
3. Backfill **2021-11-19 to 2026-11-19** in bounded monthly/yearly windows across approved keywords/topics, preserving actual publication date, original URL, provenance, dedupe, rejected/unsupported sources and coverage gaps. Do not infer five-year coverage from a successful run.
4. Report per source/topic/year: fetched, deduplicated, approved, rejected, unavailable, and earliest/latest verified date. Publish only after existing release gates.
5. Reader ASK and homepage ASK share the same approved records but retain distinct access policies. No subscriber data or privileged Supabase key in the browser.

This is an operational scope record, **not** evidence that any source was activated or any backfill completed.

## Binding owner clarification — canonical topic taxonomy

**The GPIR live homepage header and its existing mega-menu entries/subentries are the ONLY approved topic scope for the five-year backfill.** Derive topic identities and labels from the currently approved menu source at `index.html` (or its signed Payload-managed canonical equivalent at release time). Do not create a parallel 36-topic taxonomy, substitute supplier categories, or classify header navigation utilities as intelligence subjects.

- Traverse each actual intelligence/research topic in the header and its submenus; preserve the exact displayed labels, parent-child relationships and canonical route identifiers. Menu entries such as Home, sign-in, Repository navigation, or generic search controls are not standalone intelligence topics.
- Entries labelled Coming Soon remain in scope as taxonomy labels if they represent substantive topics, but do not imply a published research page or historical evidence exists.
- Freeze a versioned menu-taxonomy snapshot with source commit/signed CMS edition before a backfill batch; any later owner-approved menu change is handled as a versioned delta, not an implicit change in historical classification.
- Map approved source keywords and synonyms to these canonical menu topic IDs; a record may map to more than one menu topic without duplicating the underlying source record.
- Report coverage by menu category/subcategory, year and source, including zero-result categories, unsupported feeds and provenance. Preserve the existing approval threshold, no synthetic data and existing 12-hour archive behavior.
- ASK GPIR homepage, signed-in Reader Dashboard and Observatory consume this same taxonomy; the presentation and entitlements remain distinct.

**Implementation gate:** confirm the menu snapshot matches the currently deployed signed Payload edition before executing any historical batch. No backfill or source activation is claimed by this specification.

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

## 2026-11-20 reconciliation

FinTech News Singapore subsequently passed the machine-readable feed, official
category API, canonical URL, publication timestamp and full article-evidence
checks. It is now active as T3 source `FINTECHNEWS-SG-008`; its exact five-year
receipt is recorded in `GPIR-LIVE-SOURCE-BACKFILL-RECEIPT-20261120.md`.
This appended outcome supersedes the candidate-only status for that source but
does not convert any other candidate in this document into an approved source.

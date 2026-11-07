# M39 — Open API source evaluation (2026-11-07)

This is a source-governance assessment, not activation approval. Preserve the existing gpir-intelligence-fetch → gpir_process_raw_record → gpir-intelligence-publish architecture and current thresholds.

| Provider | Verified API | Proposed role | Gate |
|---|---|---|---|
| BIS | https://stats.bis.org/api-doc/v2/ | Authoritative statistical datasets and CBDC context | Choose dataflow and validate provenance, observation date, update frequency, licensing and attribution; NOT a press-release feed |
| GDELT | https://api.gdeltproject.org/api/v2/doc/doc | Discovery of third-party articles and trend signals | Secondary discovery only; original publisher origin, date and body must independently pass validation before publication |
| OpenSanctions | https://www.opensanctions.org/docs/api/ | Sanctions/PEP context | Hosted API key and commercial licensing review; avoid processing personal data before governance review |
| Crunchbase | https://data.crunchbase.com/docs/api-essentials | Corporate funding and M&A | Licensed API key required; do not assume free access |
| OpenCorporates | https://api.opencorporates.com/documentation/API-Reference | Corporate entity registry | API key, permitted-use and license check required |

Implementation boundary: BIS observations are structured data and must not be injected into article-only candidate/publication contracts without an approved data mapping. GDELT URLs are discovery pointers, not trusted primary source records. Keep GDELT out of GREEN/T1 automatic publication; retain independent original-origin verification. No credentials in GitHub. Do not lower confidence or trust gates.

Acceptance: provider terms verified; sample response parsed; stable canonical source identifiers; source publication/observation timestamp validated; attribution and license recorded; tests pass; separately approved production activation.

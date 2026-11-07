# M39 approved-source acquisition release gate

Production baseline: gpir-intelligence-fetch v50, SHA256 d41e09293b138c24eeba364aab49a9484d39bd4a64a6dbfd393bfdae7b67a47a.

This change deliberately does NOT activate MAS, ECB or RBA until feed endpoints, source-specific parsing, canonical URL, timestamp and evidence extraction tests pass. Existing SFA/RBI/PYMNTS allowlist is unchanged. The new constants document exact source-registry IDs for implementation.

Required before activation:
- MAS: validate registered mas-rss URL, authoritative article links and publication timestamps.
- ECB: correct current registry feed URL (currently europa.eu/rss/press.html) against official ECB RSS feeds.
- RBA: validate official media-release feed and parser, not the homepage.
- Preserve all source tiers, Gate 2 and publisher thresholds.

No production deployment is authorized by this draft.
## Official feed discovery (2026-11-07)

- ECB official press RSS: https://www.ecb.europa.eu/rss/press.html (linked by https://www.ecb.europa.eu/home/html/rss.en.html). Current registry URL `https://europa.eu/rss/press.html` does not match this official ECB endpoint. Do not modify registry until tested.
- RBA official media-release RSS: https://www.rba.gov.au/rss/rss-cb-media-releases.xml (linked by https://www.rba.gov.au/rss/). Current registry points at the homepage; requires controlled endpoint correction.
- MAS: https://www.mas.gov.sg/ shows official current media releases, but its registered `https://mas.gov.sg/rss/news-and-publications` feed has not been independently verified. Do not activate on an assumed RSS endpoint.

## Parser acceptance gates

1. Retrieve valid XML RSS/Atom or verified HTML listing from the official origin; reject off-origin links and feed containers.
2. Require per-item title, official canonical HTTPS URL, and source-issued timestamp; never substitute acquisition time as publication time.
3. Fetch leaf article and extract actual body evidence; reject navigation-only or boilerplate snippets.
4. Dry-run each source; confirm publication gating and source trust tier remain unchanged; no automatic publication of T3 content.
5. Only then activate IDs in `CONTROLLED_SOURCE_IDS` and schedule approved sources. Existing sources must pass regression tests.

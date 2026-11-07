# M39 approved-source acquisition release gate

Production baseline: gpir-intelligence-fetch v50, SHA256 d41e09293b138c24eeba364aab49a9484d39bd4a64a6dbfd393bfdae7b67a47a.

This change deliberately does NOT activate MAS, ECB or RBA until feed endpoints, source-specific parsing, canonical URL, timestamp and evidence extraction tests pass. Existing SFA/RBI/PYMNTS allowlist is unchanged. The new constants document exact source-registry IDs for implementation.

Required before activation:
- MAS: validate registered mas-rss URL, authoritative article links and publication timestamps.
- ECB: correct current registry feed URL (currently europa.eu/rss/press.html) against official ECB RSS feeds.
- RBA: validate official media-release feed and parser, not the homepage.
- Preserve all source tiers, Gate 2 and publisher thresholds.

No production deployment is authorized by this draft.
# Global Alerts historical coverage and continuous ingestion

Coverage starts on 1 January 2021. Scheduled discovery and validation have no fixed end date. The public ticker uses its existing rolling 12-hour source-publication window, while validated historical items remain available in the repository under relevant headings. Keep the 95% publication threshold and source checks.

## Search and classification vocabulary

| Heading | Include |
|---|---|
| Remittances and cross-border | Remittances, cross-border payments, money movement, inward and outward payments, diaspora and migrant payments, international migration when directly relevant to payments |
| Payments and fintech | Payments, global and regional fintech, corporate payments, global and regional aggregators, payment gateways, cards, alternative payment methods (APM), digital wallets, super apps, BNPL |
| Platforms and operating models | PASS and PaaS with contextual evidence, TaaS, SaaS, CaaS, BaaS, pay on behalf of (POBO), collect on behalf of (COBO). Require payments context for ambiguous short acronyms. |
| Regulation and risk | Payments and fintech licensing, payments AML, payment fraud. Corroborate regulatory claims with the competent authority. |
| Emerging technology | Blockchain payment networks, agentic AI in payments, Web3, emerging AI applications for payments and banking |

## Source-to-repository acceptance

1. Use the Trusted Source Network to discover official feeds, newsrooms and archive endpoints. Validate each publisher domain, article timestamp, and parser before activation. Directory candidate status alone does not authorize ingestion.
2. Use supported date-window adapters to stage bounded monthly batches. Record each source and month, the discovered and rejected counts and the remaining queue. Preserve canonical URL and fingerprint deduplication across historical and forward discovery.
3. Verify approved items by topic and source publication year, including sparse and empty year/topic combinations. Preserve the publication gate and keep historical batches out of the live ticker.
4. Continue the existing scheduled ingestion and publishing cycles. For each new source, verify one genuine article from ingestion through publication, ticker expiry and archive retrieval before reporting acceptance.

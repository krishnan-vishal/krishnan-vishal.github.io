# M39-FX Stage 1 Historical Coverage

## Evidence and boundary

- Read-only Production inventory on 5 November 2026: 938 preserved legacy capture rows across all 134 pairs. The additive observation columns and composite unique index are present, while all 938 rows remain legacy captures and zero dated historical rows have been inserted.
- Historical evidence: a live plan used Frankfurter's ECB-specific provider route. A separate injected-522 drill recovered the same coverage through bounded monthly CSV requests to the official ECB Data API. Both paths retained only actual source fixing dates and returned identical coverage totals.
- Requested interval: 1 January through 5 November 2026. The first available ECB fixing is 2 January; the latest is 4 November. Weekends and TARGET closing days are not gaps.
- No Production row write, workflow dispatch, repository-variable change, authentication, authorization, PayPal, subscription, checkout, or reader entitlement change occurred during this closure pass.

## Coverage summary

- Configured archive pairs: **134**
- ECB-supported configured pairs: **60**
- Unsupported configured pairs: **74**
- Genuine ECB observation dates: **216**
- Planned idempotent rows: **12,960**
- Unsupported currencies: **AED, ARS, BDT, BHD, EGP, KES, KWD, KZT, LKR, NGN, OMR, PKR, QAR, RUB, SAR, UZS, VND**
- Calculated cross/inverse rows use same-date ECB legs and are labelled; no missing dates or rates are synthesized.

## Representative validation

| Pair | Universe status | Source method | Earliest | Latest | Dates | First rate | Latest rate |
|---|---|---|---|---|---:|---:|---:|
| USD/JPY | Configured | derived-cross | 2026-01-02 | 2026-11-04 | 216 | 156.932002388875 | 158.249755924381 |
| EUR/JPY | Supported source; not in configured 134 | provider-native | 2026-01-02 | 2026-11-04 | 216 | 183.94 | 178.3 |
| USD/INR | Configured | derived-cross | 2026-01-02 | 2026-11-04 | 216 | 90.1962289907 | 94.640809443508 |
| AED/INR | Unsupported (AED) | — | — | — | 0 | — | — |

## Pair-level coverage

| Pair | Status | Method | Earliest | Latest | Dates | Missing periods |
|---|---|---|---|---|---:|---|
| USD/INR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| EUR/INR | SUPPORTED | provider-native | 2026-01-02 | 2026-11-04 | 216 | None |
| GBP/INR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| AED/INR | UNSUPPORTED (AED) | — | — | — | 0 | None |
| SGD/INR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| AUD/INR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| CAD/INR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| JPY/INR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| CNY/INR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| EUR/USD | SUPPORTED | provider-native | 2026-01-02 | 2026-11-04 | 216 | None |
| GBP/USD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/JPY | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/CNY | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/CHF | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/CAD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/HKD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/AED | UNSUPPORTED (AED) | — | — | — | 0 | None |
| USD/SGD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/SAR | UNSUPPORTED (SAR) | — | — | — | 0 | None |
| USD/QAR | UNSUPPORTED (QAR) | — | — | — | 0 | None |
| USD/KWD | UNSUPPORTED (KWD) | — | — | — | 0 | None |
| USD/BHD | UNSUPPORTED (BHD) | — | — | — | 0 | None |
| USD/OMR | UNSUPPORTED (OMR) | — | — | — | 0 | None |
| EUR/GBP | SUPPORTED | provider-native | 2026-01-02 | 2026-11-04 | 216 | None |
| AUD/USD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| NZD/USD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/PKR | UNSUPPORTED (PKR) | — | — | — | 0 | None |
| USD/BDT | UNSUPPORTED (BDT) | — | — | — | 0 | None |
| USD/LKR | UNSUPPORTED (LKR) | — | — | — | 0 | None |
| USD/AUD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/EUR | SUPPORTED | derived-inverse | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/GBP | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/RUB | UNSUPPORTED (RUB) | — | — | — | 0 | None |
| USD/KZT | UNSUPPORTED (KZT) | — | — | — | 0 | None |
| USD/UZS | UNSUPPORTED (UZS) | — | — | — | 0 | None |
| USD/BRL | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/MXN | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/ARS | UNSUPPORTED (ARS) | — | — | — | 0 | None |
| USD/ZAR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/NGN | UNSUPPORTED (NGN) | — | — | — | 0 | None |
| USD/KES | UNSUPPORTED (KES) | — | — | — | 0 | None |
| USD/EGP | UNSUPPORTED (EGP) | — | — | — | 0 | None |
| USD/THB | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/MYR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/IDR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/PHP | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| USD/VND | UNSUPPORTED (VND) | — | — | — | 0 | None |
| USD/NZD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| INR/PKR | UNSUPPORTED (PKR) | — | — | — | 0 | None |
| INR/BDT | UNSUPPORTED (BDT) | — | — | — | 0 | None |
| INR/LKR | UNSUPPORTED (LKR) | — | — | — | 0 | None |
| INR/CNY | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| INR/JPY | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| INR/AUD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| INR/SGD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| INR/HKD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| PKR/BDT | UNSUPPORTED (PKR, BDT) | — | — | — | 0 | None |
| PKR/LKR | UNSUPPORTED (PKR, LKR) | — | — | — | 0 | None |
| PKR/CNY | UNSUPPORTED (PKR) | — | — | — | 0 | None |
| PKR/JPY | UNSUPPORTED (PKR) | — | — | — | 0 | None |
| PKR/AUD | UNSUPPORTED (PKR) | — | — | — | 0 | None |
| PKR/SGD | UNSUPPORTED (PKR) | — | — | — | 0 | None |
| PKR/HKD | UNSUPPORTED (PKR) | — | — | — | 0 | None |
| BDT/LKR | UNSUPPORTED (BDT, LKR) | — | — | — | 0 | None |
| BDT/CNY | UNSUPPORTED (BDT) | — | — | — | 0 | None |
| BDT/JPY | UNSUPPORTED (BDT) | — | — | — | 0 | None |
| BDT/AUD | UNSUPPORTED (BDT) | — | — | — | 0 | None |
| BDT/SGD | UNSUPPORTED (BDT) | — | — | — | 0 | None |
| BDT/HKD | UNSUPPORTED (BDT) | — | — | — | 0 | None |
| LKR/CNY | UNSUPPORTED (LKR) | — | — | — | 0 | None |
| LKR/JPY | UNSUPPORTED (LKR) | — | — | — | 0 | None |
| LKR/AUD | UNSUPPORTED (LKR) | — | — | — | 0 | None |
| LKR/SGD | UNSUPPORTED (LKR) | — | — | — | 0 | None |
| LKR/HKD | UNSUPPORTED (LKR) | — | — | — | 0 | None |
| CNY/JPY | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| CNY/AUD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| CNY/SGD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| CNY/HKD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| JPY/AUD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| JPY/SGD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| JPY/HKD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| AUD/SGD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| AUD/HKD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| SGD/HKD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| EUR/CHF | SUPPORTED | provider-native | 2026-01-02 | 2026-11-04 | 216 | None |
| EUR/RUB | UNSUPPORTED (RUB) | — | — | — | 0 | None |
| EUR/KZT | UNSUPPORTED (KZT) | — | — | — | 0 | None |
| EUR/UZS | UNSUPPORTED (UZS) | — | — | — | 0 | None |
| GBP/CHF | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| GBP/RUB | UNSUPPORTED (RUB) | — | — | — | 0 | None |
| GBP/KZT | UNSUPPORTED (KZT) | — | — | — | 0 | None |
| GBP/UZS | UNSUPPORTED (UZS) | — | — | — | 0 | None |
| CHF/RUB | UNSUPPORTED (RUB) | — | — | — | 0 | None |
| CHF/KZT | UNSUPPORTED (KZT) | — | — | — | 0 | None |
| CHF/UZS | UNSUPPORTED (UZS) | — | — | — | 0 | None |
| RUB/KZT | UNSUPPORTED (RUB, KZT) | — | — | — | 0 | None |
| RUB/UZS | UNSUPPORTED (RUB, UZS) | — | — | — | 0 | None |
| KZT/UZS | UNSUPPORTED (KZT, UZS) | — | — | — | 0 | None |
| BRL/MXN | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| BRL/ARS | UNSUPPORTED (ARS) | — | — | — | 0 | None |
| BRL/ZAR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| BRL/NGN | UNSUPPORTED (NGN) | — | — | — | 0 | None |
| BRL/KES | UNSUPPORTED (KES) | — | — | — | 0 | None |
| BRL/EGP | UNSUPPORTED (EGP) | — | — | — | 0 | None |
| MXN/ARS | UNSUPPORTED (ARS) | — | — | — | 0 | None |
| MXN/ZAR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| MXN/NGN | UNSUPPORTED (NGN) | — | — | — | 0 | None |
| MXN/KES | UNSUPPORTED (KES) | — | — | — | 0 | None |
| MXN/EGP | UNSUPPORTED (EGP) | — | — | — | 0 | None |
| ARS/ZAR | UNSUPPORTED (ARS) | — | — | — | 0 | None |
| ARS/NGN | UNSUPPORTED (ARS, NGN) | — | — | — | 0 | None |
| ARS/KES | UNSUPPORTED (ARS, KES) | — | — | — | 0 | None |
| ARS/EGP | UNSUPPORTED (ARS, EGP) | — | — | — | 0 | None |
| ZAR/NGN | UNSUPPORTED (NGN) | — | — | — | 0 | None |
| ZAR/KES | UNSUPPORTED (KES) | — | — | — | 0 | None |
| ZAR/EGP | UNSUPPORTED (EGP) | — | — | — | 0 | None |
| NGN/KES | UNSUPPORTED (NGN, KES) | — | — | — | 0 | None |
| NGN/EGP | UNSUPPORTED (NGN, EGP) | — | — | — | 0 | None |
| KES/EGP | UNSUPPORTED (KES, EGP) | — | — | — | 0 | None |
| THB/MYR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| THB/IDR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| THB/PHP | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| THB/VND | UNSUPPORTED (VND) | — | — | — | 0 | None |
| THB/NZD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| MYR/IDR | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| MYR/PHP | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| MYR/VND | UNSUPPORTED (VND) | — | — | — | 0 | None |
| MYR/NZD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| IDR/PHP | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| IDR/VND | UNSUPPORTED (VND) | — | — | — | 0 | None |
| IDR/NZD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| PHP/VND | UNSUPPORTED (VND) | — | — | — | 0 | None |
| PHP/NZD | SUPPORTED | derived-cross | 2026-01-02 | 2026-11-04 | 216 | None |
| VND/NZD | UNSUPPORTED (VND) | — | — | — | 0 | None |

## Production backfill approval checkpoint

Production remains unchanged. A separate owner approval must authorize this controlled sequence:

1. Apply `20261104093000_m39_fx_historical_observation_identity.sql` to add `observation_date`, `rate_method`, and the unique observation key.
2. Manually dispatch `GPIR FX Market Data Refresh` with `historical_reference_action=apply-approved`.
3. After the post-backfill counts pass, set repository variable `FX_HISTORY_OBSERVATION_IDENTITY_ENABLED=true` so future scheduled captures use the new idempotent identity.

The variable is absent/false by default, so the scheduled writer continues its existing legacy capture contract until the owner enables observation identity. The apply path uses `upsert(..., ignoreDuplicates: true)` on the unique observation identity and never updates an existing valid row. After owner-approved merge and dispatch, verify 60 supported pairs, 12,960 source rows, 216 dates, the four representative outcomes above, and all 938 legacy capture rows unchanged before enabling the variable or declaring the backfill complete.


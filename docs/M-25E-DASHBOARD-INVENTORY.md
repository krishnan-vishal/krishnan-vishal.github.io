# M-25E Dashboard Inventory

**Starting SHA:** `6543423245ea4f9babbf72345e6da0b3516edd25`
**Inventory scope:** `assets/dashboards/`
**Inventory method:** recursive filesystem listing of `png`, `jpg`, `jpeg` and `webp` files, grouped by deterministic filename identity.

## Counts

| Measure | Before implementation | After implementation |
|---|---:|---:|
| Dashboard image files | 123 | 123 |
| PNG | 63 | 63 |
| JPG / JPEG | 0 | 0 |
| WebP | 60 | 60 |
| Root assets | 70 | 70 |
| Thumbnail assets | 53 | 53 |
| Country dashboard identities | 5 | 5 |
| Migration publication identities | 3 | 3 |

No dashboard artwork was added, deleted or modified by M-25E.

## Deterministic Publication Identities

Each row is a publication identity, not an image-file count. Width variants and format variants are preserved as separate files under the listed path pattern.

| Identity | Reference / family | Country | Region | Scope | Edition / version | Canonical display artifact | Thumbnail variant | Related country page | Existing registry identity | Files |
|---|---|---|---|---|---|---|---|---|---|---:|
| `dashboard-uae` | `VK-GPIR-GCC-UAE-DB-001` | United Arab Emirates | GCC | Country dashboard | `001`; website edition `2026.1` | `assets/dashboards/VK-GPIR-GCC-UAE-DB-001.png` | `assets/dashboards/thumbnail/VK-GPIR-GCC-UAE-TN-001.png` | `pages/countries/uae.html` | `dashboard:uae` | 8 |
| `dashboard-ksa` | `VK-GPIR-GCC-KSA-DB-001` | Kingdom of Saudi Arabia | GCC | Country dashboard | `001`; website edition `2026.1` | `assets/dashboards/VK-GPIR-GCC-KSA-DB-001.png` | `assets/dashboards/thumbnail/VK-GPIR-GCC-KSA-TN-001.png` | `pages/countries/saudi-arabia.html` | `dashboard:ksa` | 8 |
| `dashboard-qatar` | `VK-GPIR-GCC-QAT-DB-001` | State of Qatar | GCC | Country dashboard | `001`; website edition `2026.1` | `assets/dashboards/VK-GPIR-GCC-QAT-DB-001.png` | `assets/dashboards/thumbnail/VK-GPIR-GCC-QAT-TN-001.png` | `pages/countries/qatar.html` | `dashboard:qatar` | 8 |
| `dashboard-india` | `VK-GPIR-APAC-IND-DB-001` | Republic of India | APAC | Country dashboard | `001`; website edition `2026.1` | `assets/dashboards/VK-GPIR-APAC-IND-DB-001.png` | `assets/dashboards/thumbnail/VK-GPIR-APAC-IND-TN-001.png` | `pages/countries/india.html` | `dashboard:india` | 8 |
| `dashboard-singapore` | `VK-GPIR-APAC-SGP-DB-001` | Republic of Singapore | APAC | Country dashboard | `001`; website edition `2026.1` | `assets/dashboards/VK-GPIR-APAC-SGP-DB-001.png` | `assets/dashboards/thumbnail/VK-GPIR-APAC-SGP-TN-001.png` | `pages/countries/singapore.html` | `dashboard:singapore` | 8 |
| unavailable | `VK-GPIR-GCC-UAE-MIG-001` | United Arab Emirates | GCC | Migration publication | `001` | `assets/dashboards/VK-GPIR-GCC-UAE-MIG-001.png` | `assets/dashboards/thumbnail/VK-GPIR-GCC-UAE-MIG-TN-001.png` | `pages/countries/uae.html` | No separate dashboard registry identity | 10 |
| unavailable | `VK-GPIR-GCC-KSA-MIG-001` | Kingdom of Saudi Arabia | GCC | Migration publication | `001` | `assets/dashboards/VK-GPIR-GCC-KSA-MIG-001.png` | `assets/dashboards/thumbnail/VK-GPIR-GCC-KSA-MIG-TN-001.png` | `pages/countries/saudi-arabia.html` | No separate dashboard registry identity | 10 |
| unavailable | `VK-GPIR-GCC-QAT-MIG-001` | State of Qatar | GCC | Migration publication | `001` | `assets/dashboards/VK-GPIR-GCC-QAT-MIG-001.png` | `assets/dashboards/thumbnail/VK-GPIR-GCC-QAT-MIG-TN-001.png` | `pages/countries/qatar.html` | No separate dashboard registry identity | 10 |

For every identity, the complete file set consists of the canonical PNG/WebP plus the available `-w480`, `-w640`, `-w800`, `-w960`, `-w1280` and thumbnail counterparts shown by the filesystem. No JPG/JPEG, Taiwan, China, Hong Kong, Japan, Korea, Macau, Mongolia, North Korea, or other additional country dashboard identity was found.

## Reconciliation

- Physically present and metadata-backed: 5 country `DB` identities.
- Physically present but not separately metadata-backed: 3 `MIG` publication families. They remain preserved and are already embedded on UAE, Saudi Arabia and Qatar pages.
- Registry-backed country relationships: 5, all reciprocal `COUNTRY` / `DASHBOARD` relationships.
- Broken canonical image paths: 0.
- Search records added to `search-index.json`: 0. Existing search runtime derives dashboard records from `dashboard-metadata.json`.
- Duplicate or variant files: 115 format/width/thumbnail variants; no duplicate publication identity was deleted or reclassified.
- Historical candidates: none deterministically established. The available `001` families do not provide multiple editions or dates.
- Unmapped dashboard identities: 3 migration publication families, intentionally not promoted to new `DASHBOARD` records because their existing role is migration publication content rather than a separate country dashboard.
- Missing metadata: dashboard source, methodology, disclaimer, period, direction, use case, metric and unit remain unavailable in the existing metadata and are not inferred.

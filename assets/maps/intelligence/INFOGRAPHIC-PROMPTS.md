# GPIR Intelligence Library — Infographic Generation Prompts

This file contains 26 ready-to-run prompts, one per placeholder infographic currently
sitting in `assets/maps/intelligence/MP-0XX.../`. Each placeholder is a blank bordered
box with only a title — none of these have real artwork yet.

Run each prompt through your image-generation tool of choice (or hand to a designer),
export at **3840×2160px** (16:9, matching the existing placeholder files), and save
directly over the destination path listed — no other code changes are needed, since
the site already references these exact filenames.

## Shared style guide (paste into every prompt, or set as a system/style prompt once)

Reference image: `assets/architecture/thumbnails/swift-messaging-network.png` — match
this exactly. If your tool supports an image reference, attach that file. Otherwise
describe it as:

> Clean executive infographic in a "financial data intelligence" style, 3840x2160px,
> white background. Top-left: the FINTECHOISIS logo exactly as used on the live site
> — a navy circle outline (no fill) containing a stylized navy "F" mark, with a thin
> gold arc swoosh wrapping the lower-right of the circle and ending in a small solid
> gold dot — followed by the wordmark "FINTECHOISIS" in bold navy with the "OISIS"
> portion in gold, and the tagline "GLOBAL PAYMENTS INTELLIGENCE REPOSITORY" in small
> gray letter-spaced caps beneath it. Do not use a plain letter-in-a-circle monogram,
> a different letterform, or a filled-circle badge — match this exact mark (source:
> `assets/branding/logos/fo-logo-horizontal.svg` in the repo; attach it directly as a
> reference image if your tool supports it). Top-right: a navy pill badge reading
> "GPIR • GLOBAL PAYMENTS INTELLIGENCE REPOSITORY". Below that, a large bold navy
> headline in a serif display font, a
> smaller gray subtitle line, and a row of pipe-separated ( | ) descriptor tags in
> bold navy small-caps. A thin gold horizontal rule beneath. Main body: a horizontal
> or grid-based flow/network diagram using thin-stroke navy line icons inside circular
> badges, connected by arrows or dotted lines, each node labeled with a short caption
> underneath. Below the diagram: a three-column footer band — a navy-headed "KEY
> FACTS" style box on the left, a gold-headed "GPIR INTELLIGENCE" callout box with a
> 2-3 sentence narrative in the middle, and a navy-headed stat-grid box on the right
> (icon + big number + label, repeated 4x). Bottom bar: full-width navy strip with a
> small globe icon + "GPIR | GLOBAL PAYMENTS INTELLIGENCE REPOSITORY" in text (not
> the full circular logo mark — text only, same treatment as the site footer), the
> tagline "Independent Intelligence. Trusted Insights. Connected World.", and a gold
> CTA pill on the right reading "www.fintechoisis.com/gpir".
> Colour palette strictly: Executive Navy #0F2747 (headlines, icons, borders, footer
> bar), Executive Gold #C8A24A (accents, the GPIR Intelligence band, CTA pill,
> highlighted keywords), white (#FFFFFF) background, light gray (#F4F6F9) for
> secondary card backgrounds, dark gray (#556070) for body copy. Sans-serif for body
> text (Inter/Helvetica-style), serif display font for the main headline only (matches
> the site's Playfair Display headings). No photographic imagery, no 3D renders, no
> gradients beyond the header/footer bars — flat, editorial, boardroom-report quality,
> not a "tech startup" or "AI-generated" look.

Every prompt below assumes that style guide is already applied — it only adds the
topic-specific content brief.

---

### MP-020 — Real-Time Payment Systems
**Tag:** Infrastructure · **Destination:** `assets/maps/intelligence/MP-020/MP-020.png`

Diagram: a world map silhouette in the background (faint, navy-on-white) with 8-10
labeled pins for major live RTP schemes (UPI – India, PIX – Brazil, FedNow – US,
FPS – UK, PayNow – Singapore, SEPA Instant – EU, PromptPay – Thailand, Pix-style
rails elsewhere). Flow strip beneath: Sender → Bank/PSP → Real-Time Rail → Beneficiary
Bank → Recipient, with a "<10 seconds" badge on the rail node. Footer stat grid:
countries live with RTP (60+), average settlement time (<10 sec), 24×7 availability,
annual RTP transaction volume.

### MP-021 — Digital Wallet Coverage
**Tag:** Wallets · **Destination:** `assets/maps/intelligence/MP-021/MP-021.png`

Diagram: central wallet icon branching into 3 wallet categories (Bank-linked wallets,
Telco/mobile-money wallets, Super-app wallets) each with 2-3 example rail icons
(card top-up, QR pay, P2P transfer, bill pay, in-app checkout). Footer stat grid:
global wallet users (billions), wallet share of e-commerce payments (%), fastest
growing region (APAC/Africa), average wallets per user.

### MP-022 — SWIFT Network Coverage
**Tag:** Correspondent Banking · **Destination:** `assets/maps/intelligence/MP-022/MP-022.png`

Diagram: a hub-and-spoke network with a central "SWIFT" node connected to regional
hub nodes (Americas, EMEA, APAC), each hub connected to 3-4 country/bank nodes.
Footer stat grid: connected institutions (11,000+), countries & territories (200+),
daily message volume, ISO 20022 migration progress (%).

### MP-023 — Stablecoin Adoption
**Tag:** Stablecoins · **Destination:** `assets/maps/intelligence/MP-023/MP-023.png`

Diagram: a comparison flow of 4-5 major stablecoins (USDT, USDC, PYUSD, FDUSD, plus
one regional example) as circular badges sized roughly by market cap, arranged around
a central "Stablecoin Market" hub, with small arrows to use-case labels (cross-border
settlement, trading collateral, remittances, treasury). Footer stat grid: total
stablecoin market cap (USD), % of crypto transaction volume, dominant chain, YoY
growth rate.

### MP-024 — CBDC Landscape
**Tag:** CBDCs · **Destination:** `assets/maps/intelligence/MP-024/MP-024.png`

Diagram: a 4-stage maturity ladder (Research → Pilot → Launched → Live at Scale)
as horizontal bands, with country-name chips placed under each stage (e.g. China/
e-CNY and Nigeria/eNaira under Live, India/e-Rupee under Pilot, US/EU under Research).
Footer stat grid: countries exploring CBDCs (130+), countries live (count), retail
vs wholesale split, projected launches next 24 months.

### MP-025 — Global Payment Infrastructure Overview
**Tag:** Infrastructure · **Destination:** `assets/maps/intelligence/MP-025/MP-025.png`

Diagram: a layered stack diagram (not horizontal flow) — from bottom to top:
"Settlement Rails" (RTGS, ACH, card networks), "Messaging Layer" (SWIFT, ISO 20022),
"Access Layer" (banks, PSPs, fintechs), "Experience Layer" (apps, wallets, checkout).
Footer stat grid: rails tracked globally, countries covered, real-time rails share,
legacy-to-ISO20022 migration %.

### MP-026 — Global Cross-Border Payment Corridors
**Tag:** Cross-Border · **Destination:** `assets/maps/intelligence/MP-026/MP-026.png`

Diagram: world map with 8-10 curved gold arc lines connecting the top trade/remittance
corridors (US–Mexico, UAE–India, Saudi–Pakistan, UK–Nigeria, Singapore–India, etc.),
line thickness roughly proportional to flow size, with a small volume label on each
arc. Footer stat grid: total cross-border flows (USD trillions), top corridor by
volume, average corridor growth rate, number of corridors tracked.

### MP-027 — Global Correspondent Banking Network
**Tag:** Correspondent Banking · **Destination:** `assets/maps/intelligence/MP-027/MP-027.png`

Diagram: 3-tier hierarchy — Tier 1 global transaction banks (5-6 logos-as-labels) at
top, connected downward to Tier 2 regional correspondent banks, connected downward to
Tier 3 respondent/local banks, with nostro/vostro account icons on the connecting
lines. Footer stat grid: active correspondent relationships tracked, nostro accounts
mapped, average correspondent chain length, corridors with direct settlement.

### MP-028 — FX Liquidity & Treasury Centres
**Tag:** Treasury · **Destination:** `assets/maps/intelligence/MP-028/MP-028.png`

Diagram: world map with 5-6 major FX/treasury hub cities marked (London, New York,
Singapore, Hong Kong, Dubai, Tokyo), each pin sized by daily FX turnover share, with
a small clock icon showing trading-session overlap. Footer stat grid: daily global FX
turnover (USD trillions), top trading hub by volume, currencies actively traded,
average settlement time (T+1/T+2).

### MP-029 — Global Regulatory & Licensing Landscape
**Tag:** Regulatory · **Destination:** `assets/maps/intelligence/MP-029/MP-029.png`

Diagram: a world map colour-coded (using navy/gold/gray shading intensity, not a
rainbow legend) by regulatory regime maturity (e.g. comprehensive PSD2/PSD3-style
frameworks, emerging frameworks, early-stage), with 4-5 labeled regulator examples
(FCA, MAS, DFSA, RBI, FinCEN). Footer stat grid: jurisdictions tracked, licensing
regimes mapped, average licensing timeline, frameworks updated in last 12 months.

### MP-030 — Digital Identity & KYC Infrastructure
**Tag:** Identity · **Destination:** `assets/maps/intelligence/MP-030/MP-030.png`

Diagram: an onboarding flow — Applicant → Document Capture → Biometric Verification →
Sanctions/PEP Screening → Digital ID Issued → Reusable KYC — as a left-to-right chain
of circular icon nodes. Footer stat grid: national digital ID schemes tracked, average
onboarding time, reusable-KYC adoption %, countries with e-KYC frameworks.

### MP-031 — AML & Sanctions Intelligence
**Tag:** Regulatory · **Destination:** `assets/maps/intelligence/MP-031/MP-031.png`

Diagram: a funnel — Transaction Monitoring → Screening (sanctions/PEP/adverse media)
→ Alert Triage → SAR/STR Filing → Regulatory Reporting — as a vertical funnel with
shrinking-width bands. Footer stat grid: sanctions lists tracked globally, average
false-positive rate, jurisdictions with mandatory STR filing, typical alert-to-SAR
conversion rate.

### MP-032 — Cross-Border Settlement Networks
**Tag:** Cross-Border · **Destination:** `assets/maps/intelligence/MP-032/MP-032.png`

Diagram: three parallel settlement models shown as separate small flow chains side by
side — "Correspondent Banking" (bank→correspondent→bank), "Multilateral/Nexus-style"
(bank→shared hub→bank), "Stablecoin Settlement" (bank→on-chain→bank) — for visual
comparison. Footer stat grid: average settlement time per model, cost per model
(relative), corridors using multilateral rails, fastest-growing settlement model.

### MP-033 — Global Payment Gateways
**Tag:** Infrastructure · **Destination:** `assets/maps/intelligence/MP-033/MP-033.png`

Diagram: central "Payment Gateway" hub node branching out to acquirer banks, card
networks, alternative payment methods, and fraud/risk engines, then converging back
to "Merchant Settlement". Footer stat grid: gateways tracked globally, average
authorization rate, supported payment methods (count), average checkout latency.

### MP-034 — Fintech Ecosystem Landscape
**Tag:** Fintech · **Destination:** `assets/maps/intelligence/MP-034/MP-034.png`

Diagram: a radial/quadrant map with 6 fintech categories as labeled segments around
a center (Payments & Wallets, Lending, WealthTech, InsurTech, RegTech, Banking-as-a-
Service), each segment showing 2-3 example company-type icons (no real logos — use
generic building/app icons). Footer stat grid: fintechs tracked globally, total
sector funding (USD), unicorns tracked, fastest-growing category.

### MP-035 — Global Money Movement Atlas
**Tag:** Cross-Border · **Destination:** `assets/maps/intelligence/MP-035/MP-035.png`

Diagram: world map with directional flow bands grouped by purpose — trade payments,
remittances, treasury flows, capital markets settlement — each a differently-styled
arc (solid gold / dashed navy / dotted gray) with a small legend. Footer stat grid:
total global money movement (USD trillions/year), remittance share, trade payment
share, treasury/capital markets share.

### MP-036 — Payments Risk & Fraud Intelligence
**Tag:** Risk · **Destination:** `assets/maps/intelligence/MP-036/MP-036.png`

Diagram: a radar/spoke chart with 5-6 fraud typologies as spokes (card-not-present
fraud, APP/authorized push payment fraud, account takeover, synthetic identity,
first-party fraud, mule networks), each spoke ending in a small icon + one-line
description. Footer stat grid: global fraud losses (USD billions/year), fastest-
growing fraud type, average fraud detection rate, real-time monitoring adoption %.

### MP-037 — Cyber Resilience in Payments
**Tag:** Risk · **Destination:** `assets/maps/intelligence/MP-037/MP-037.png`

Diagram: a shield-centered diagram — core "Payment Infrastructure" shield icon
surrounded by 4 defense-layer rings labeled (Perimeter Security, Encryption &
Tokenization, Fraud Analytics, Incident Response), with small lock/key icons on
each ring. Footer stat grid: average cost of a payments breach (USD), institutions
with 24×7 SOC coverage (%), average incident detection time, regulatory cyber
frameworks tracked.

### MP-038 — Digital Asset & Tokenized Payments
**Tag:** Digital Assets · **Destination:** `assets/maps/intelligence/MP-038/MP-038.png`

Diagram: a comparison ladder of 4 tokenization use cases (Tokenized Deposits,
Tokenized Securities Settlement, Stablecoin Payments, Tokenized Trade Finance),
each with a small before/after mini-flow (traditional process vs on-chain process).
Footer stat grid: tokenized asset market size (USD), institutions piloting tokenized
deposits, average settlement time reduction, regulatory sandboxes tracking tokenization.

### MP-039 — Open Finance & API Ecosystem
**Tag:** API · **Destination:** `assets/maps/intelligence/MP-039/MP-039.png`

Diagram: a hub-and-spoke with "Open Finance API Layer" at center, spokes to Account
Aggregation, Payment Initiation, Lending Data Sharing, Insurance Data Sharing, and
Investment Data Sharing, each spoke ending in a small consumer-facing app icon.
Footer stat grid: countries with open banking/finance mandates, active API
connections tracked, TPPs (third-party providers) registered, average API uptime.

### MP-040 — AI in Payments & Financial Infrastructure
**Tag:** AI · **Destination:** `assets/maps/intelligence/MP-040/MP-040.png`

Diagram: a value-chain strip showing where AI is applied — Fraud Detection, Credit
Risk Scoring, Customer Service (chat/voice), Regulatory Reporting Automation,
Payment Routing Optimization — as 5 icon nodes along a horizontal chain with a
small "AI" badge on each. Footer stat grid: institutions using AI in fraud detection
(%), average fraud-detection accuracy improvement, AI-driven cost savings estimate,
regulatory AI guidance frameworks tracked.

### MP-041 — Next-Generation Payment Orchestration
**Tag:** Infrastructure · **Destination:** `assets/maps/intelligence/MP-041/MP-041.png`

Diagram: a central "Orchestration Layer" node with routing lines fanning out to
multiple acquirers, PSPs, and local payment methods, and a feedback loop line
labeled "Smart Routing / Failover" looping back into the orchestration node.
Footer stat grid: average authorization uplift from orchestration (%), PSPs
connected via orchestration platforms, merchants using orchestration (est.),
average integration time saved.

### MP-042 — Global Digital Identity & Trust Frameworks
**Tag:** Identity · **Destination:** `assets/maps/intelligence/MP-042/MP-042.png`

Diagram: a world map with 5-6 flagship national/regional digital identity schemes
pinned (EU Digital Identity Wallet, India Aadhaar, Singapore Singpass, UK's
identity framework, UAE's national ID), connected by dashed lines to a central
"Cross-Border Trust Framework" node. Footer stat grid: national digital ID schemes
tracked, population coverage under digital ID (billions), cross-border mutual
recognition agreements, average verification time.

### MP-043 — Quantum-Ready Payments & Cryptography
**Tag:** Emerging Tech · **Destination:** `assets/maps/intelligence/MP-043/MP-043.png`

Diagram: a before/after comparison — "Current Cryptography" (RSA/ECC lock icon)
transitioning via an arrow through "Migration Period" to "Post-Quantum Cryptography"
(a reinforced/layered lock icon), with 3 small milestone markers along the arrow
(NIST PQC standards, pilot migrations, full rollout). Footer stat grid: institutions
piloting post-quantum cryptography, NIST-standardized PQC algorithms, estimated
migration timeline (years), payment networks with published PQC roadmaps.

### MP-044 — Global Treasury, Liquidity & FX Management
**Tag:** Treasury · **Destination:** `assets/maps/intelligence/MP-044/MP-044.png`

Diagram: a treasury operations cycle shown as a circular flow — Cash Positioning →
Liquidity Forecasting → FX Hedging → Intercompany Netting → Investment/Funding →
back to Cash Positioning — as 5 nodes arranged in a ring with directional arrows.
Footer stat grid: global corporate cash under active treasury management (USD),
average liquidity forecast accuracy, real-time treasury adoption %, top hedging
instrument used.

### MP-045 — Global Payment Observability & Operational Intelligence
**Tag:** Infrastructure · **Destination:** `assets/maps/intelligence/MP-045/MP-045.png`

Diagram: a monitoring-dashboard-style layout — central "Observability Layer" node
with feeds coming in from Transaction Monitoring, Latency Tracking, Uptime/SLA
Monitoring, and Reconciliation, each feed shown as a small line-chart icon rather
than a photo of a real dashboard. Footer stat grid: transactions monitored in
real time (daily volume), average uptime SLA across tracked rails, mean time to
detect an incident, institutions with 24×7 observability coverage.

---

## Delivery checklist per infographic

1. Run the shared style guide + the topic brief above through your generation tool.
2. Export as PNG, 3840×2160px.
3. Save directly to the **Destination** path listed (overwrites the placeholder).
4. No HTML/CSS changes needed — the site already points at these exact filenames.

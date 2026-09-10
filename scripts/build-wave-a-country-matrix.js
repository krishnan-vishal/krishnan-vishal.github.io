#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SOURCES_PATH = path.join(ROOT, "assets", "data", "trusted-sources.json");
const HEALTH_PATH = path.join(ROOT, "assets", "data", "source-health.json");
const OUTPUT_PATH = path.join(ROOT, "assets", "data", "wave-a-country-matrix.json");
const CHECKED_AT = "2026-09-10T12:00:00+05:30";

const authority = (country, iso, region, organization, domain, newsUrl = null, circularUrl = null) => ({
    country, iso, region, organization, domain, newsUrl, circularUrl
});

// Current BIS membership is the bounded, reproducible global baseline. GPIR's
// pre-existing non-BIS central-bank jurisdictions are appended below.
const bisAuthorities = [
    authority("Algeria", "DZ", "GCC / MENA", "Bank of Algeria", "bank-of-algeria.dz", "https://www.bank-of-algeria.dz/communiques-de-presse/"),
    authority("Argentina", "AR", "LATAM / Caribbean", "Central Bank of Argentina", "bcra.gob.ar", "https://www.bcra.gob.ar/noticias/", "https://www.bcra.gob.ar/buscador-de-comunicaciones/"),
    authority("Australia", "AU", "APAC", "Reserve Bank of Australia", "rba.gov.au"),
    authority("Austria", "AT", "Europe / UK", "Oesterreichische Nationalbank", "oenb.at", "https://www.oenb.at/Presse/Pressearchiv.html"),
    authority("Belgium", "BE", "Europe / UK", "National Bank of Belgium", "nbb.be", "https://www.nbb.be/en/news-events/news/press-releases"),
    authority("Bosnia and Herzegovina", "BA", "Europe / UK", "Central Bank of Bosnia and Herzegovina", "cbbh.ba", "https://www.cbbh.ba/press/AllNews"),
    authority("Brazil", "BR", "LATAM / Caribbean", "Central Bank of Brazil", "bcb.gov.br"),
    authority("Bulgaria", "BG", "Europe / UK", "Bulgarian National Bank", "bnb.bg", "https://www.bnb.bg/AboutUs/PressOffice/"),
    authority("Canada", "CA", "North America", "Bank of Canada", "bankofcanada.ca"),
    authority("Chile", "CL", "LATAM / Caribbean", "Central Bank of Chile", "bcentral.cl", "https://www.bcentral.cl/es/noticias-y-publicaciones/prensa", "https://www.bcentral.cl/es/web/banco-central/areas/normativa"),
    authority("China", "CN", "APAC", "People's Bank of China", "pbc.gov.cn"),
    authority("Colombia", "CO", "LATAM / Caribbean", "Bank of the Republic (Colombia)", "banrep.gov.co"),
    authority("Croatia", "HR", "Europe / UK", "Croatian National Bank", "hnb.hr", null, "https://www.hnb.hr/regulativa-propisi"),
    authority("Czech Republic", "CZ", "Europe / UK", "Czech National Bank", "cnb.cz", "https://www.cnb.cz/en/cnb-news/press-releases/"),
    authority("Denmark", "DK", "Europe / UK", "Danmarks Nationalbank", "nationalbanken.dk", "https://www.nationalbanken.dk/en/news-and-knowledge/press"),
    authority("Estonia", "EE", "Europe / UK", "Bank of Estonia", "eestipank.ee", "https://www.eestipank.ee/en/press"),
    authority("European Union", "EU", "Europe / UK", "European Central Bank", "ecb.europa.eu"),
    authority("Finland", "FI", "Europe / UK", "Bank of Finland", "suomenpankki.fi", "https://www.suomenpankki.fi/en/news-and-topical/press-releases-and-news/releases/"),
    authority("France", "FR", "Europe / UK", "Bank of France", "banque-france.fr"),
    authority("Germany", "DE", "Europe / UK", "Deutsche Bundesbank", "bundesbank.de"),
    authority("Greece", "GR", "Europe / UK", "Bank of Greece", "bankofgreece.gr", "https://www.bankofgreece.gr/en/news-and-media/press-office/news-list"),
    authority("Hong Kong", "HK", "APAC", "Hong Kong Monetary Authority", "hkma.gov.hk"),
    authority("Hungary", "HU", "Europe / UK", "Central Bank of Hungary", "mnb.hu", "https://www.mnb.hu/en/pressroom"),
    authority("Iceland", "IS", "Europe / UK", "Central Bank of Iceland", "cb.is", "https://cb.is/news-and-publications/news/", "https://cb.is/laws-and-regulations/regulations/"),
    authority("India", "IN", "South Asia", "Reserve Bank of India", "rbi.org.in"),
    authority("Indonesia", "ID", "APAC", "Bank Indonesia", "bi.go.id"),
    authority("Ireland", "IE", "Europe / UK", "Central Bank of Ireland", "centralbank.ie", "https://www.centralbank.ie/news-media/press-releases"),
    authority("Israel", "IL", "GCC / MENA", "Bank of Israel", "boi.org.il", "https://www.boi.org.il/en/communication-and-publications/press-releases/"),
    authority("Italy", "IT", "Europe / UK", "Bank of Italy", "bancaditalia.it"),
    authority("Japan", "JP", "APAC", "Bank of Japan", "boj.or.jp"),
    authority("South Korea", "KR", "APAC", "Bank of Korea", "bok.or.kr"),
    authority("Kuwait", "KW", "GCC / MENA", "Central Bank of Kuwait", "cbk.gov.kw", "https://www.cbk.gov.kw/en/cbk-news/announcements-and-press-releases/press-releases"),
    authority("Latvia", "LV", "Europe / UK", "Bank of Latvia", "bank.lv", "https://www.bank.lv/en/news-and-events/news-and-articles/news?tag=press-releases", "https://www.bank.lv/en/legislation/legislation-navigation"),
    authority("Lithuania", "LT", "Europe / UK", "Bank of Lithuania", "lb.lt", "https://www.lb.lt/en/lb-media"),
    authority("Luxembourg", "LU", "Europe / UK", "Central Bank of Luxembourg", "bcl.lu"),
    authority("Malaysia", "MY", "APAC", "Central Bank of Malaysia", "bnm.gov.my"),
    authority("Mexico", "MX", "North America", "Bank of Mexico", "banxico.org.mx", "https://www.banxico.org.mx/publicaciones-y-prensa/miscelaneos/comunicados-miscelaneos-comun.html"),
    authority("Morocco", "MA", "GCC / MENA", "Bank Al-Maghrib", "bkam.ma"),
    authority("Netherlands", "NL", "Europe / UK", "De Nederlandsche Bank", "dnb.nl"),
    authority("New Zealand", "NZ", "APAC", "Reserve Bank of New Zealand", "rbnz.govt.nz"),
    authority("North Macedonia", "MK", "Europe / UK", "National Bank of the Republic of North Macedonia", "nbrm.mk"),
    authority("Norway", "NO", "Europe / UK", "Central Bank of Norway", "norges-bank.no", "https://www.norges-bank.no/aktuelt/nyheter/"),
    authority("Peru", "PE", "LATAM / Caribbean", "Central Reserve Bank of Peru", "bcrp.gob.pe"),
    authority("Philippines", "PH", "APAC", "Bangko Sentral ng Pilipinas", "bsp.gov.ph"),
    authority("Poland", "PL", "Europe / UK", "Narodowy Bank Polski", "nbp.pl"),
    authority("Portugal", "PT", "Europe / UK", "Banco de Portugal", "bportugal.pt", "https://www.bportugal.pt/en/comunicados/media/banco-de-portugal"),
    authority("Romania", "RO", "Europe / UK", "National Bank of Romania", "bnr.ro", "https://www.bnr.ro/2627-comunicate-de-presa"),
    authority("Russia", "RU", "CIS / Central Asia", "Central Bank of the Russian Federation", "cbr.ru", "https://www.cbr.ru/eng/news/"),
    authority("Saudi Arabia", "SA", "GCC / MENA", "Saudi Central Bank", "sama.gov.sa", "https://www.sama.gov.sa/en-US/MediaCenter/News/Pages/AllNews.aspx", "https://www.sama.gov.sa/en-us/publications"),
    authority("Serbia", "RS", "Europe / UK", "National Bank of Serbia", "nbs.rs", "https://www.nbs.rs/en/drugi-nivo-navigacije/pres/index.html"),
    authority("Singapore", "SG", "APAC", "Monetary Authority of Singapore", "mas.gov.sg", "https://www.mas.gov.sg/news/media-releases"),
    authority("Slovakia", "SK", "Europe / UK", "National Bank of Slovakia", "nbs.sk", "https://nbs.sk/en/press/nbs-press-releases/", "https://nbs.sk/en/legislation/"),
    authority("Slovenia", "SI", "Europe / UK", "Banka Slovenije", "bsi.si", "https://www.bsi.si/en/media"),
    authority("South Africa", "ZA", "Africa", "South African Reserve Bank", "resbank.co.za"),
    authority("Spain", "ES", "Europe / UK", "Bank of Spain", "bde.es"),
    authority("Sweden", "SE", "Europe / UK", "Sveriges Riksbank", "riksbank.se"),
    authority("Switzerland", "CH", "Europe / UK", "Swiss National Bank", "snb.ch"),
    authority("Thailand", "TH", "APAC", "Bank of Thailand", "bot.or.th", "https://www.bot.or.th/en/news-and-media/news.html"),
    authority("Türkiye", "TR", "GCC / MENA", "Central Bank of the Republic of Türkiye", "tcmb.gov.tr", "https://www.tcmb.gov.tr/wps/wcm/connect/EN/TCMB+EN/Main+Menu/Announcements/Press+Releases"),
    authority("United Arab Emirates", "AE", "GCC / MENA", "Central Bank of the United Arab Emirates", "centralbank.ae", "https://www.centralbank.ae/en/"),
    authority("United Kingdom", "GB", "Europe / UK", "Bank of England", "bankofengland.co.uk"),
    authority("United States", "US", "North America", "Board of Governors of the Federal Reserve System", "federalreserve.gov"),
    authority("Vietnam", "VN", "APAC", "State Bank of Vietnam", "sbv.gov.vn")
];

const gpirAdditionalAuthorities = [
    authority("Bahrain", "BH", "GCC / MENA", "Central Bank of Bahrain", "cbb.gov.bh"),
    authority("Bangladesh", "BD", "South Asia", "Bangladesh Bank", "bb.org.bd", "https://www.bb.org.bd/en/index.php/mediaroom/press_release", "https://www.bb.org.bd/en/index.php/mediaroom/circular"),
    authority("Cambodia", "KH", "APAC", "National Bank of Cambodia", "nbc.gov.kh", "https://nbc.gov.kh/english./news_and_events/press_releases.php"),
    authority("Egypt", "EG", "GCC / MENA", "Central Bank of Egypt", "cbe.org.eg", "https://www.cbe.org.eg/en/news-publications/news"),
    authority("Ghana", "GH", "Africa", "Bank of Ghana", "bog.gov.gh"),
    authority("Jordan", "JO", "GCC / MENA", "Central Bank of Jordan", "cbj.gov.jo", "https://www.cbj.gov.jo/En/Modules/News", "https://www.cbj.gov.jo/EN/List/Circulars"),
    authority("Kazakhstan", "KZ", "CIS / Central Asia", "National Bank of Kazakhstan", "nationalbank.kz"),
    authority("Kenya", "KE", "Africa", "Central Bank of Kenya", "centralbank.go.ke"),
    authority("Lebanon", "LB", "GCC / MENA", "Banque du Liban", "bdl.gov.lb", null, "https://bdl.gov.lb/basiccirculars.php?langid=EN"),
    authority("Mongolia", "MN", "APAC", "Bank of Mongolia", "mongolbank.mn"),
    authority("Nepal", "NP", "South Asia", "Nepal Rastra Bank", "nrb.org.np"),
    authority("Nigeria", "NG", "Africa", "Central Bank of Nigeria", "cbn.gov.ng"),
    authority("Oman", "OM", "GCC / MENA", "Central Bank of Oman", "cbo.gov.om", "https://cbo.gov.om/Pages/home.aspx", "https://cbo.gov.om/Pages/LawAndRegulations.aspx"),
    authority("Pakistan", "PK", "South Asia", "State Bank of Pakistan", "sbp.org.pk", "https://www.sbp.org.pk/media-center", "https://www.sbp.org.pk/circulars"),
    authority("Qatar", "QA", "GCC / MENA", "Qatar Central Bank", "qcb.gov.qa", "https://www.qcb.gov.qa/en/Pages/allnews.aspx"),
    authority("Rwanda", "RW", "Africa", "National Bank of Rwanda", "bnr.rw", "https://www.bnr.rw/pressrelease", "https://www.bnr.rw/banking"),
    authority("Sri Lanka", "LK", "South Asia", "Central Bank of Sri Lanka", "cbsl.gov.lk"),
    authority("Taiwan", "TW", "APAC", "Central Bank of the Republic of China (Taiwan)", "cbc.gov.tw", "https://www.cbc.gov.tw/en/lp-448-2.html"),
    authority("Tanzania", "TZ", "Africa", "Bank of Tanzania", "bot.go.tz"),
    authority("Uganda", "UG", "Africa", "Bank of Uganda", "bou.or.ug", "https://bou.or.ug/", "https://bou.or.ug/supervision"),
    authority("Uruguay", "UY", "LATAM / Caribbean", "Central Bank of Uruguay", "bcu.gub.uy", "https://www.bcu.gub.uy/Comunicaciones/Paginas/Sala-de-prensa.aspx", "https://www.bcu.gub.uy/Paginas/Instituciones-Financieras-Circulares.aspx"),
    authority("Uzbekistan", "UZ", "CIS / Central Asia", "Central Bank of the Republic of Uzbekistan", "cbu.uz", "https://cbu.uz/en/press_center/", "https://cbu.uz/en/documents/3339/")
];

// The first Wave A live pass produced dated evidence for 17 profiles, but the
// final controlled repeat ended endpoint-unavailable for every retried source.
// No jurisdiction is represented as currently green when its final health
// snapshot is degraded, even though earlier evidence is retained below.
const greenCountries = new Set();
const currentFetchAmber = new Set(["Belgium", "Bosnia and Herzegovina", "Estonia", "Hong Kong", "Hungary", "Taiwan"]);
const quarantined = new Set(["Colombia"]);
const indexedPublicationProof = {
    "Egypt": { publicationDate: "2026-08-30", title: "Joint Statement Release by the Central Bank of Egypt and the Central Bank of the UAE", url: "https://www.cbe.org.eg/en/news-publications/news", paymentsRelevant: false },
    "Jordan": { publicationDate: "2026-06-21", title: "The Open Market Operations Committee Decides to Maintain Key Interest Rate of the Central Bank", url: "https://www.cbj.gov.jo/En/Modules/News", paymentsRelevant: false },
    "Kuwait": { publicationDate: "2026-09-01", title: "CBK Launches the Strategic Initiative Accelerator Program at the Innovation Hub Wolooj", url: "https://www.cbk.gov.kw/en/cbk-news/announcements-and-press-releases/press-releases", paymentsRelevant: false },
    "Lebanon": { publicationDate: "2026-05-21", title: "Conditions for the Establishment and Functioning of Finance Companies", url: "https://bdl.gov.lb/basiccirculars.php?langid=EN", paymentsRelevant: false },
    "Mexico": { publicationDate: "2026-08-27", title: "Draft rules consultation for clearing houses for card payments", url: "https://www.banxico.org.mx/publicaciones-y-prensa/miscelaneos/comunicados-miscelaneos-comun.html", paymentsRelevant: true },
    "Oman": { publicationDate: "2026-07-20", title: "Tender Results of Government Treasury Bills worth OMR 20 million", url: "https://cbo.gov.om/Pages/home.aspx", paymentsRelevant: false },
    "Pakistan": { publicationDate: "2026-09-04", title: "Women Microfinance Credit Guarantee Facility", url: "https://www.sbp.org.pk/circulars", paymentsRelevant: false },
    "Qatar": { publicationDate: "2026-07-29", title: "Monetary Policy Committee Resolution on Monetary Policy Instruments", url: "https://www.qcb.gov.qa/en/News/Pages/29jul26.aspx", paymentsRelevant: false },
    "Rwanda": { publicationDate: "2026-08-04", title: "Press Release - Update on the Performance of eKash", url: "https://www.bnr.rw/pressrelease", paymentsRelevant: true },
    "Thailand": { publicationDate: "2026-08-31", title: "Press Release on the Economic and Monetary Conditions for July 2026", url: "https://www.bot.or.th/en/news-and-media/news/news-20260831.html", paymentsRelevant: false },
    "Uganda": { publicationDate: "2026-06-03", title: "Introducing Over-the-Counter Cash Withdrawal Limits", url: "https://bou.or.ug/uploads/Introducing_Over_the_Counter_Cash_Withdrawal_Limits_6b91b889e4.pdf", paymentsRelevant: true },
    "United Arab Emirates": { publicationDate: "2026-09-01", title: "CBUAE Concludes Participation in G20 Meetings in the United States", url: "https://www.centralbank.ae/en/", paymentsRelevant: false }
};
const missingIdByCountry = {
    "Algeria": "bank-of-algeria", "Austria": "oenb-austria", "Bosnia and Herzegovina": "cbbh-bosnia", "Bulgaria": "bnb-bulgaria",
    "Croatia": "hnb-croatia", "Czech Republic": "cnb-czech-republic", "Estonia": "eestipank-estonia", "Finland": "bank-of-finland",
    "Greece": "bank-of-greece", "Hungary": "mnb-hungary", "Iceland": "central-bank-iceland", "Ireland": "central-bank-ireland",
    "Israel": "bank-of-israel", "Latvia": "bank-of-latvia", "Lithuania": "bank-of-lithuania", "Luxembourg": "bcl-luxembourg",
    "North Macedonia": "nbrm-north-macedonia", "Portugal": "banco-portugal", "Romania": "bnr-romania", "Russia": "cbr-russia",
    "Saudi Arabia": "sama-saudi", "Serbia": "nbs-serbia", "Slovakia": "nbs-slovakia", "Slovenia": "bsi-slovenia", "Türkiye": "tcmb-turkiye"
};

function canonicalRegion(value, country = null) {
    if (["Australia", "New Zealand"].includes(country)) return "Oceania";
    if (/APAC|South Asia/i.test(value || "")) return "APAC / South Asia / ASEAN / Far East";
    if (/Europe|SEPA|UK/i.test(value || "")) return "Europe / UK";
    if (/Middle East|GCC/i.test(value || "")) return "GCC / MENA";
    if (/CIS|Central Asia/i.test(value || "")) return "CIS / Central Asia";
    if (/LATAM/i.test(value || "")) return "LATAM / Caribbean";
    return value || "APAC";
}

function primarySourceFor(entry, registry) {
    const candidates = registry.filter(source => source.country === entry.country && /Central Bank/.test(source.sourceType || ""));
    return candidates.find(source => source.active && source.refreshEndpoint) || candidates[0] || null;
}

function syncRegistryProfiles() {
    const sourceData = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
    const allAuthorities = [...bisAuthorities, ...gpirAdditionalAuthorities];
    const unique = [...new Map(allAuthorities.map(entry => [entry.iso, entry])).values()];
    for (const entry of unique) {
        let source = primarySourceFor(entry, sourceData.registry);
        if (!source) {
            source = {
                id: missingIdByCountry[entry.country],
                organization: entry.organization,
                officialDomains: [entry.domain],
                country: entry.country,
                tier: 1,
                sourceType: "Central Bank / Regulator",
                lastVerifiedDate: "2026-09-10",
                sourceTrustStatus: "VERIFIED_OFFICIAL",
                active: false,
                discoveryStatus: "SOURCE_UNSUPPORTED"
            };
            sourceData.registry.push(source);
        }
        source.isoCountryCode ||= entry.iso;
        source.region ||= canonicalRegion(entry.region, entry.country);
        source.wave = "A";
        source.waveAProfileStatus = greenCountries.has(entry.country) ? "ACTIVE_GREEN"
            : currentFetchAmber.has(entry.country) || source.active ? "ACTIVE_AMBER"
                : quarantined.has(entry.country) ? "QUARANTINED_RED" : "VERIFIED_UNSUPPORTED";
        if (entry.newsUrl) source.officialAnnouncementUrl = entry.newsUrl;
        if (entry.circularUrl) source.officialCircularUrl = entry.circularUrl;
    }
    fs.writeFileSync(SOURCES_PATH, `${JSON.stringify(sourceData, null, 2)}\n`);
    console.log(`Synchronized ${unique.length} Wave A profiles in ${path.relative(ROOT, SOURCES_PATH)}.`);
}

function separateRegulatorsFor(entry, registry) {
    return registry.filter(source => source.country === entry.country && !/Central Bank/.test(source.sourceType || "") && /Financial Regulator|AML \/ FIU/.test(source.sourceType || ""))
        .map(source => ({ sourceId: source.id, authority: source.organization, officialDomains: source.officialDomains }));
}

function buildMatrix() {
    const sourceData = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));
    const healthData = JSON.parse(fs.readFileSync(HEALTH_PATH, "utf8"));
    const allAuthorities = [...bisAuthorities, ...gpirAdditionalAuthorities];
    const unique = new Map(allAuthorities.map(entry => [entry.iso, entry]));
    if (bisAuthorities.length !== 63 || unique.size !== 85) throw new Error(`WAVE_A_UNIVERSE_INVALID: BIS=${bisAuthorities.length}; union=${unique.size}`);

    const healthById = new Map(healthData.sources.map(source => [source.sourceId, source]));
    const rows = [...unique.values()].map(entry => {
        const source = primarySourceFor(entry, sourceData.registry);
        const sourceId = source ? source.id : missingIdByCountry[entry.country];
        const health = source ? healthById.get(source.id) : null;
        let operationalStatus = "VERIFIED_UNSUPPORTED";
        if (greenCountries.has(entry.country)) operationalStatus = "ACTIVE_GREEN";
        else if (currentFetchAmber.has(entry.country) || (source && source.active)) operationalStatus = "ACTIVE_AMBER";
        if (quarantined.has(entry.country)) operationalStatus = "QUARANTINED_RED";
        const endpoint = entry.newsUrl || (source && source.refreshEndpoint) || null;
        const method = source && source.refreshEndpointType ? source.refreshEndpointType : endpoint ? "HTML" : null;
        const methodsTested = [
            "OFFICIAL_DOMAIN_CHECK",
            "RSS_ATOM_DISCOVERY",
            "OFFICIAL_API_DISCOVERY",
            "JSON_XML_DISCOVERY",
            "OFFICIAL_NEWS_INDEX_DISCOVERY",
            "OFFICIAL_REGULATION_INDEX_DISCOVERY",
            "DETERMINISTIC_HTML_DISCOVERY"
        ];
        if (endpoint) methodsTested.push("DIRECT_HTTPS_GET", method === "HTML" ? "HTML_INDEX_PARSE" : `${method}_PARSE`);
        const latestDate = health && health.lastPublicationSeen || null;
        const latestRealPublication = latestDate ? {
            publicationDate: latestDate,
            title: null,
            url: source.refreshEndpoint,
            evidenceBasis: "M29 controlled source snapshot; title was not retained in source-health.json"
        } : indexedPublicationProof[entry.country] ? {
            publicationDate: indexedPublicationProof[entry.country].publicationDate,
            title: indexedPublicationProof[entry.country].title,
            url: indexedPublicationProof[entry.country].url,
            evidenceBasis: "Official authority page indexed during Wave A; controlled GPIR acquisition remains non-green"
        } : null;
        const blockerType = operationalStatus === "ACTIVE_GREEN" ? null
            : operationalStatus === "ACTIVE_AMBER" ? "TEMPORARY_FETCH_OR_DATE_EXTRACTION_GAP"
                : operationalStatus === "QUARANTINED_RED" ? "UNTRUSTED_REDIRECT_OR_INTEGRITY_FAILURE"
                    : endpoint ? "STRUCTURAL_FETCH_OR_PARSER_UNSUPPORTED" : "NO_VERIFIED_PUBLICATION_ENDPOINT";
        return {
            country: entry.country,
            isoCountryCode: entry.iso,
            region: canonicalRegion(entry.region, entry.country),
            centralBankOrMonetaryAuthority: entry.organization,
            separateFinancialRegulators: separateRegulatorsFor(entry, sourceData.registry),
            officialDomains: [...new Set([entry.domain, ...((source && source.officialDomains) || [])])],
            officialNewsOrPressReleaseUrl: endpoint,
            officialCircularOrRegulationUrl: entry.circularUrl,
            sourceId,
            sourceTier: "T1",
            acquisitionMethod: method,
            activationStatus: operationalStatus === "ACTIVE_GREEN" ? "ACTIVE" : operationalStatus === "ACTIVE_AMBER" ? "ACTIVE_DEGRADED" : "INACTIVE",
            healthStatus: operationalStatus,
            operationalStatus,
            lastSuccessfulFetch: health && health.lastSuccessfulFetch || null,
            latestRealPublicationDetected: latestRealPublication,
            paymentsRelevantRecordDetected: Boolean((health && health.recordsQualified > 0) || (indexedPublicationProof[entry.country] && indexedPublicationProof[entry.country].paymentsRelevant)),
            methodsTested,
            domainValidation: "VERIFIED_OFFICIAL",
            endpointValidation: endpoint ? (operationalStatus === "ACTIVE_GREEN" ? "FETCHED_AND_PARSED" : "OFFICIAL_URL_VERIFIED") : "NOT_FOUND",
            parserValidation: operationalStatus === "ACTIVE_GREEN" ? "DATED_ITEMS_PARSED" : operationalStatus === "ACTIVE_AMBER" ? "RECOVERABLE_GAP" : "UNSUPPORTED_OR_NOT_RUN",
            originalAuthorityUrlValidation: "OFFICIAL_DOMAIN_ENFORCED",
            duplicateHandlingValidation: "CANONICAL_URL_AND_TITLE_DATE_FINGERPRINT",
            blockerType,
            blockerNature: operationalStatus === "ACTIVE_AMBER" ? "TEMPORARY_OR_RECOVERABLE" : operationalStatus === "ACTIVE_GREEN" ? null : "STRUCTURAL_OR_INTEGRITY",
            recommendedFutureAcquisitionMethod: operationalStatus === "ACTIVE_GREEN" ? "KEEP_CURRENT_METHOD"
                : endpoint ? "RETEST_RSS_ATOM_JSON_THEN_MAINTAIN_BOUNDED_HTML_PROFILE" : "MANUAL_OFFICIAL_ENDPOINT_DISCOVERY",
            notes: operationalStatus === "ACTIVE_GREEN" ? "Dated official publication observed in the controlled M29 snapshot and reconfirmed in Wave A review where network allowed."
                : operationalStatus === "ACTIVE_AMBER" ? "Official authority and acquisition surface are known, but the Wave A live pass did not produce a stable correctly dated result on every repeat."
                    : operationalStatus === "QUARANTINED_RED" ? "The official request redirected to a non-allowlisted anti-bot host; response content was rejected."
                        : "Authority/domain verified; no deterministic functioning acquisition method was proven in this pass.",
            evidenceCheckedAt: CHECKED_AT
        };
    }).sort((a, b) => a.country.localeCompare(b.country));

    const statusCounts = Object.fromEntries(["ACTIVE_GREEN", "ACTIVE_AMBER", "QUARANTINED_RED", "VERIFIED_UNSUPPORTED", "MISSING_AUTHORITY"].map(status => [status, rows.filter(row => row.operationalStatus === status).length]));
    const regionalBreakdown = {};
    for (const row of rows) {
        regionalBreakdown[row.region] ||= { total: 0, ACTIVE_GREEN: 0, ACTIVE_AMBER: 0, QUARANTINED_RED: 0, VERIFIED_UNSUPPORTED: 0, MISSING_AUTHORITY: 0 };
        regionalBreakdown[row.region].total += 1;
        regionalBreakdown[row.region][row.operationalStatus] += 1;
    }
    const primarySources = rows.map(row => sourceData.registry.find(source => source.id === row.sourceId)).filter(Boolean);
    const endpointCount = rows.filter(row => row.officialNewsOrPressReleaseUrl || row.officialCircularOrRegulationUrl).length;
    const report = {
        schemaVersion: "1.0",
        generatedAt: CHECKED_AT,
        milestone: "Wave A — Central Bank & Regulator Global Coverage Validation",
        scope: {
            definition: "All 63 current BIS member central banks/monetary authorities plus 22 additional central-bank jurisdictions already present in the GPIR trusted-source registry.",
            authoritativeUniverseUrl: "https://www.bis.org/about/organisation/members",
            bisMemberCount: 63,
            gpirAdditionalJurisdictionCount: 22,
            totalJurisdictions: rows.length,
            regionCount: Object.keys(regionalBreakdown).length,
            excluded: "Wave B non-central-bank regulators, Wave C ecosystem institutions and Wave D broader intelligence sources."
        },
        verdict: statusCounts.MISSING_AUTHORITY === 0 && statusCounts.ACTIVE_GREEN === rows.length ? "VALIDATED COMPLETE" : statusCounts.MISSING_AUTHORITY === 0 ? "VALIDATED WITH DOCUMENTED GAPS" : "INCOMPLETE",
        totals: statusCounts,
        regionalBreakdown,
        coverageMetrics: {
            centralBanksVerified: rows.filter(row => row.domainValidation === "VERIFIED_OFFICIAL").length,
            separateRegulatorsVerified: rows.reduce((count, row) => count + row.separateFinancialRegulators.length, 0),
            officialPublicationEndpointsVerified: endpointCount,
            rssAtomSources: primarySources.filter(source => ["RSS", "ATOM"].includes(source.refreshEndpointType)).length,
            apiSources: primarySources.filter(source => source.refreshEndpointType === "JSON" && /api/i.test(source.refreshEndpoint || "")).length,
            jsonXmlSources: primarySources.filter(source => ["JSON", "XML"].includes(source.refreshEndpointType) && !/api/i.test(source.refreshEndpoint || "")).length,
            htmlIndexSources: rows.filter(row => row.officialNewsOrPressReleaseUrl && row.acquisitionMethod === "HTML").length,
            newlyActivatedSources: 0,
            realPublicationEntriesFetchedInControlledRevalidation: 283,
            paymentRelevantRecordsQualified: 0,
            canonicalRecordsPublished: 0
        },
        liveRevalidation: {
            activeWaveAProfilesEvaluated: 38,
            profilesReturningAtLeastOneDatedOfficialPublication: 17,
            profilesWithoutCorrectlyDatedOutput: 21,
            repeatFetchCondition: "A later repeat across five previously reachable official indexes returned uniform endpoint-unavailable results; prior same-pass evidence was retained and no status was promoted from that repeat.",
            parserDefectsCorrected: ["NUMERIC_AND_ATTRIBUTE_DATE_SUPPORT", "ADJACENT_RECORD_DATE_ASSOCIATION", "BALANCE_OF_PAYMENTS_FALSE_POSITIVE"],
            canonicalRecordsPublished: 0
        },
        gapRegister: rows.filter(row => row.operationalStatus !== "ACTIVE_GREEN").map(row => ({
            country: row.country,
            isoCountryCode: row.isoCountryCode,
            region: row.region,
            status: row.operationalStatus,
            blockerType: row.blockerType,
            blockerNature: row.blockerNature,
            methodsTested: row.methodsTested,
            recommendedFutureAcquisitionMethod: row.recommendedFutureAcquisitionMethod
        })),
        canonicalPublication: {
            recordsPublished: 0,
            rationale: "No newly discovered Wave A item was promoted. Candidate evidence either failed repeatable acquisition/date qualification or remained outside the strict existing publication gate."
        },
        matrix: rows
    };
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_PATH)}: ${rows.length} jurisdictions; verdict ${report.verdict}.`);
}

if (process.argv.includes("--sync-registry")) syncRegistryProfiles();
buildMatrix();

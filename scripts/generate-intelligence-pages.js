/*=====================================================
  GPIR INTELLIGENCE SUMMARY PAGE GENERATOR

  Generates one real, standalone, crawlable/shareable static page per
  published announcement record (assets/data/announcements.json) at
  pages/intelligence/{id}.html -- so every alert/announcement has a
  permanent URL with the original source hyperlink embedded, not just
  a JS-rendered modal on the homepage.

  Only records that already reach the public ticker get a page
  (status GPIR_CLASSIFIED and not trust-blocked) -- this generator
  does not fabricate content for categories (M&A, stock prices,
  AML/ISO changes, etc.) that don't yet have a real, sourced record.
  As real records are added to announcements.json in any category,
  re-running this script produces their pages automatically.

  Run manually after editing announcements.json:
    node scripts/generate-intelligence-pages.js

  This is a dev-time build step (like scripts/gpir-perf-audit.js),
  not a runtime dependency -- the generated pages are plain static
  HTML with no dependency on this script after generation.
======================================================*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const ANNOUNCEMENTS_PATH = path.join(ROOT, "assets/data/announcements.json");
const REGISTRY_PATH = path.join(ROOT, "assets/data/trusted-sources.json");
const CONTENT_REGISTRY_PATH = path.join(ROOT, "assets/data/content-registry.json");
const HOMEPAGE_SOURCE_PATH = path.join(ROOT, "index.html");
const TEMPLATE_SOURCE_PATH = path.join(ROOT, "pages/legal/privacy-policy.html");
const OUTPUT_DIR = path.join(ROOT, "pages/intelligence");
const SITEMAP_PATH = path.join(ROOT, "sitemap.xml");
const SITE_ORIGIN = "https://krishnan-vishal.github.io";
const DISCOVERY_WORKFLOW_PATH = path.join(ROOT, ".github/workflows/continuous-intelligence.yml");

// Reads the actual scheduled cadence from the existing continuous-
// intelligence workflow (deterministic build metadata) instead of a
// second hand-maintained copy that could silently drift out of sync
// with the real schedule. This describes candidate DISCOVERY only --
// publication into announcements.json always remains a separate,
// human-reviewed step, and this label must never claim otherwise.
function describeDiscoveryCadence(){
    try{
        const workflowText = fs.readFileSync(DISCOVERY_WORKFLOW_PATH, "utf8");
        const cronMatch = workflowText.match(/cron:\s*"([^"]+)"/);
        if(!cronMatch) return "on a scheduled GitHub Actions cadence";
        const everyNHours = cronMatch[1].match(/^0\s+\*\/(\d+)\s+\*\s+\*\s+\*$/);
        if(everyNHours){
            const hours = everyNHours[1];
            return `every ${hours} hour${hours === "1" ? "" : "s"}`;
        }
        return `on a scheduled GitHub Actions cadence (${cronMatch[1]})`;
    } catch {
        return "on a scheduled GitHub Actions cadence";
    }
}

function promoteStagedArtifacts(stagingRoot, artifacts){
    const backupRoot = path.join(stagingRoot, "backup");
    const backups = new Map();

    fs.mkdirSync(backupRoot, { recursive: true });

    artifacts.forEach(({ target }, index) => {
        if(fs.existsSync(target)){
            const backupPath = path.join(backupRoot, String(index));
            fs.copyFileSync(target, backupPath);
            backups.set(target, backupPath);
        }
    });

    try {
        artifacts.forEach(({ staged, target }) => fs.copyFileSync(staged, target));
    } catch(error) {
        // A promotion failure restores every prior artifact, including files
        // already copied during this promotion. This keeps the previous
        // generated publication set intact rather than leaving a partial set.
        artifacts.forEach(({ target }) => {
            const backupPath = backups.get(target);
            if(backupPath) fs.copyFileSync(backupPath, target);
            else fs.rmSync(target, { force: true });
        });
        throw error;
    }
}

/*=====================================================
  PORTED PURE LOGIC (assets/js/trust-engine.js, assets/js/announcements.js)
  Re-implemented here without any DOM dependency so trust status and
  markup can be computed at generation time and baked into static
  HTML. Kept behaviourally identical to the runtime versions -- if
  those change, mirror the change here too.
======================================================*/

function escapeHtml(str){
    if(str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(dateStr){
    if(!dateStr) return "Unavailable";
    const parts = dateStr.split("-");
    const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
    if(parts.length === 3){
        const [y,m,d] = parts;
        return `${parseInt(d,10)} ${months[parseInt(m,10)-1]} ${y}`;
    }
    if(parts.length === 2){
        const [y,m] = parts;
        return `${months[parseInt(m,10)-1]} ${y}`;
    }
    return dateStr;
}

function lifecycleFacts(record){
    const facts = [
        ["Event Type", record.eventType],
        [(record.displayLifecycleStatus === "ARCHIVED" || record.lifecycleStatus === "HISTORICAL") ? "Originally published" : "Published", record.publicationDate || record.publishedDate],
        ["GPIR Refresh Cycle", record.refreshCycle],
        ["Publication Status", (record.displayLifecycleStatus === "ARCHIVED" || record.lifecycleStatus === "HISTORICAL") ? "ARCHIVED PUBLICATION" : (record.displayLifecycleStatus || record.lifecycleStatus)]
    ].filter(([, value]) => value);
    if(!facts.length) return "";
    return `<dl class="intel-source-list intel-lifecycle-facts">${facts.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl>`;
}

function recencyStatus(dateStr, now){
    if(!dateStr) return null;
    const parts = dateStr.split("-").map(n => parseInt(n,10));
    const published = parts.length === 3
        ? new Date(parts[0], parts[1]-1, parts[2])
        : parts.length === 2
            ? new Date(parts[0], parts[1]-1, 1)
            : new Date(parts[0], 0, 1);
    const days = Math.floor((now.getTime() - published.getTime()) / 86400000);
    if(days <= 30) return "LIVE";
    if(days <= 365) return "RECENT";
    return "ARCHIVED";
}

const SUSPICIOUS_TLDS = ["xyz", "top", "click", "support", "zip", "gq", "tk"];
const SUSPICIOUS_KEYWORDS = ["login", "verify", "secure", "security", "support", "update", "confirm", "signin", "wallet-recovery"];

function hostnameOf(url){
    try{ return new URL(url).hostname.toLowerCase(); }
    catch(e){ return null; }
}

function domainMatches(hostname, officialDomain){
    return hostname === officialDomain || hostname.endsWith("." + officialDomain);
}

function lookalikeFlags(url, hostname){
    const flags = [];
    if(!hostname) return ["URL_UNPARSABLE"];
    if(!/^https:\/\//i.test(url)) flags.push("NOT_HTTPS");
    if(hostname.includes("xn--")) flags.push("PUNYCODE_DOMAIN");
    if(/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) flags.push("IP_LITERAL_HOST");
    const tld = hostname.split(".").pop();
    if(SUSPICIOUS_TLDS.includes(tld)) flags.push("WATCHLISTED_TLD");
    if(hostname.split("-").length - 1 >= 3) flags.push("EXCESSIVE_HYPHENS");
    if(SUSPICIOUS_KEYWORDS.some(kw => hostname.includes(kw))) flags.push("SUSPICIOUS_KEYWORD");
    return flags;
}

function confidenceForTier(tier){
    if(tier === 1 || tier === 2) return "HIGH";
    if(tier === 3) return "MEDIUM";
    return "LOW";
}

function evaluateSource(record, registry, registryLoaded){
    if(!record.source || !record.source.url){
        return { sourceStatus: "SOURCE_REQUIRES_VERIFICATION", confidence: "UNVERIFIED", reasons: ["NO_SOURCE_CITED"] };
    }
    const hostname = hostnameOf(record.source.url);
    const flags = lookalikeFlags(record.source.url, hostname);
    const entry = record.sourceOrgId ? registry.find(r => r.id === record.sourceOrgId) : null;

    if(!entry){
        return {
            sourceStatus: "SOURCE_REQUIRES_VERIFICATION",
            confidence: "UNVERIFIED",
            reasons: registryLoaded ? ["ORGANIZATION_NOT_REGISTERED"] : ["REGISTRY_UNAVAILABLE"]
        };
    }

    const domainOk = hostname && entry.officialDomains.some(d => domainMatches(hostname, d));
    if(!domainOk){
        return { sourceStatus: "SOURCE_WARNING", confidence: "LOW", reasons: ["DOMAIN_MISMATCH"].concat(flags) };
    }
    if(flags.length){
        return { sourceStatus: "SOURCE_WARNING", confidence: "LOW", reasons: flags };
    }
    return { sourceStatus: "SOURCE_VERIFIED", confidence: confidenceForTier(entry.tier), reasons: [] };
}

function buildReportMailto(record, reason){
    const to = "krishnanvishal12@gmail.com";
    const subject = encodeURIComponent(`GPIR source report: ${record.title}`);
    const bodyLines = [
        `Record ID: ${record.id}`,
        `Title: ${record.title}`,
        `Report reason: ${reason}`,
        `Source URL: ${record.source ? record.source.url : "(none cited)"}`,
        "",
        "Additional details:"
    ];
    const body = encodeURIComponent(bodyLines.join("\n"));
    return `mailto:${to}?subject=${subject}&body=${body}`;
}

const REPORT_REASONS = ["Suspicious link", "Possible scam", "Incorrect source", "Misleading information", "Broken link", "Duplicate", "Other"];

const CATEGORY_PRIORITY = [
    "Payment Suspension", "Regulatory", "AML / CFT", "Payment Infrastructure",
    "Cross-Border Payments", "Open Banking", "Digital Banking", "M&A",
    "Licensing", "Payments", "FinTech"
];

function categoryPriority(record){
    const idx = CATEGORY_PRIORITY.indexOf(record.category);
    return idx === -1 ? CATEGORY_PRIORITY.length : idx;
}

/*=====================================================
  BUILD
======================================================*/

function main(){

    const announcementsData = JSON.parse(fs.readFileSync(ANNOUNCEMENTS_PATH, "utf8"));
    const registryData = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    const contentRegistryData = JSON.parse(fs.readFileSync(CONTENT_REGISTRY_PATH, "utf8"));
    const registry = registryData.registry || [];
    const contentRegistry = contentRegistryData.records || [];
    const contentRegistryById = new Map(contentRegistry.map(record => [record.id, record]));
    const allRecords = (announcementsData.records || []).filter(r => r && r.id);
    const now = new Date();

    const trustByRecordId = {};
    allRecords.forEach(r => { trustByRecordId[r.id] = evaluateSource(r, registry, true); });

    // Same publication rule as the live ticker (assets/js/announcements.js
    // publishedRecords()): GPIR_CLASSIFIED and not trust-blocked. Records
    // that don't clear this bar don't get a public page either.
    const publishedRecords = allRecords
        .filter(r => r.status === "GPIR_CLASSIFIED" && r.lifecycleStatus === "CURRENT" && r.contentStatus !== "CONTENT_UNDER_REVIEW" && trustByRecordId[r.id].sourceStatus !== "SOURCE_BLOCKED")
        .sort((a, b) => {
            const rank = categoryPriority(a) - categoryPriority(b);
            if(rank !== 0) return rank;
            return (b.publishedDate || "").localeCompare(a.publishedDate || "");
        });

    const historicalRecords = allRecords
        .filter(r => r.lifecycleStatus === "HISTORICAL" && r.publicationDate && r.status === "GPIR_CLASSIFIED" && trustByRecordId[r.id].sourceStatus !== "SOURCE_BLOCKED");
    const publicRecords = publishedRecords.concat(historicalRecords);
    const recordsById = {};
    publicRecords.forEach(r => { recordsById[r.id] = r; });

    function relatedRecords(record){
        const registryRecord = contentRegistryById.get(`announcement:${record.id}`);
        if(!registryRecord) return [];
        const relationshipTargets = new Set((registryRecord.relationships || [])
            .filter(relationship => relationship.type !== "INTELLIGENCE" && relationship.type !== "ANNOUNCEMENT")
            .map(relationship => relationship.target));
        return publicRecords.filter(candidate => {
            if(candidate.id === record.id) return false;
            const candidateRegistryRecord = contentRegistryById.get(`announcement:${candidate.id}`);
            return candidateRegistryRecord && (candidateRegistryRecord.relationships || []).some(relationship => relationshipTargets.has(relationship.target));
        }).slice(0, 3);
    }

    const templateSource = fs.readFileSync(TEMPLATE_SOURCE_PATH, "utf8");

    const HERO_MARKER = '<section class="chapter-hero">';
    const FOOTER_MARKER = '<footer id="footer">';

    const heroIdx = templateSource.indexOf(HERO_MARKER);
    const footerIdx = templateSource.indexOf(FOOTER_MARKER);

    if(heroIdx === -1 || footerIdx === -1){
        throw new Error("Template extraction markers not found in " + TEMPLATE_SOURCE_PATH + " -- has the page structure changed?");
    }

    let headerBlockTemplate = templateSource.slice(0, heroIdx);
    const footerBlock = templateSource.slice(footerIdx).replace(
        /href="(privacy-policy|disclaimer|terms-of-use|copyright-ip-policy|cookie-policy)\.html"/g,
        'href="../../pages/legal/$1.html"'
    );

    // Head meta strings specific to the source template page, replaced
    // per-record below. These are literal strings from the current
    // privacy-policy.html -- if that page's own head content changes,
    // update these to match.
    const TEMPLATE_TITLE_TAG = "<title>Privacy Policy | FINTECHOISIS — GPIR</title>";
    const TEMPLATE_DESCRIPTION = "How FINTECHOISIS and the Global Payments Intelligence Repository (GPIR) collect, use, process, store, protect and disclose information.";
    const TEMPLATE_CANONICAL_URL = "https://krishnan-vishal.github.io/pages/legal/privacy-policy.html";
    const TEMPLATE_OG_TWITTER_TITLE = 'content="Privacy Policy">';

    [TEMPLATE_TITLE_TAG, TEMPLATE_DESCRIPTION, TEMPLATE_CANONICAL_URL, TEMPLATE_OG_TWITTER_TITLE].forEach(marker => {
        if(!headerBlockTemplate.includes(marker)){
            throw new Error("Expected head-meta marker not found in template: " + marker);
        }
    });

    const stagingRoot = path.join(ROOT, `.gpir-intelligence-stage-${process.pid}-${Date.now()}`);
    const stagedOutputDir = path.join(stagingRoot, "pages", "intelligence");
    const stagedSitemapPath = path.join(stagingRoot, "sitemap.xml");
    fs.mkdirSync(stagedOutputDir, { recursive: true });

    let generatedCount = 0;

    try {
    publicRecords.forEach(record => {

        const trust = trustByRecordId[record.id];
        const url = `${SITE_ORIGIN}/pages/intelligence/${record.id}.html`;
        const metaDescription = record.tickerHeadline || record.title;

        let headerBlock = headerBlockTemplate;
        headerBlock = headerBlock.split(TEMPLATE_TITLE_TAG).join(`<title>${escapeHtml(record.title)} | FINTECHOISIS — GPIR</title>`);
        headerBlock = headerBlock.split(TEMPLATE_DESCRIPTION).join(escapeHtml(metaDescription));
        headerBlock = headerBlock.split(TEMPLATE_CANONICAL_URL).join(url);
        headerBlock = headerBlock.split(TEMPLATE_OG_TWITTER_TITLE).join(`content="${escapeHtml(record.title)}">`);

        const flagMarkup = record.countryCode
            ? `<img class="flag-icon" src="../../assets/icons/flags/${escapeHtml(record.countryCode)}.svg" alt="">`
            : '<svg class="icon-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';

        const statusMeta = {
            SOURCE_VERIFIED:              { icon: "✓", label: "Source Verified",              cls: "ok" },
            SOURCE_REQUIRES_VERIFICATION: { icon: "◷", label: "Source Requires Verification",  cls: "pending" },
            SOURCE_WARNING:                { icon: "⚠", label: "Source Warning",                cls: "warning" },
            SOURCE_BLOCKED:                { icon: "⛔", label: "Source Blocked",               cls: "blocked" }
        }[trust.sourceStatus];

        const contentStatusLabel = { CONTENT_VERIFIED: "Content: Reviewed by GPIR", CONTENT_UNDER_REVIEW: "Content: Under Review" }[record.contentStatus] || "Content: Under Review";
        const badges = `
            <span class="intel-badge intel-badge--status intel-badge--${statusMeta.cls}">${statusMeta.icon} ${escapeHtml(statusMeta.label)}</span>
            <span class="intel-badge intel-badge--confidence">Confidence: ${escapeHtml(trust.confidence)}</span>
            <span class="intel-badge intel-badge--content">${escapeHtml(contentStatusLabel)}</span>
            <span class="intel-badge intel-badge--lifecycle">${escapeHtml((record.displayLifecycleStatus === "ARCHIVED" || record.lifecycleStatus === "HISTORICAL") ? "ARCHIVED PUBLICATION" : record.displayLifecycleStatus || record.lifecycleStatus || "CURRENT")}</span>
        `;

        let sourceBlock;
        if(trust.sourceStatus === "SOURCE_VERIFIED"){
            sourceBlock = `
                <div class="intel-source-block">
                    <dl class="intel-source-list">
                        ${record.organisation && record.organisation !== record.source.name ? `<dt>Organisation</dt><dd>${escapeHtml(record.organisation)}</dd>` : ""}
                        <dt>Source</dt><dd>${escapeHtml(record.source.name)}</dd>
                        <dt>Publication</dt><dd>${escapeHtml(record.source.publicationTitle)}</dd>
                        <dt>Published</dt><dd>${escapeHtml(formatDate(record.publishedDate))}</dd>
                        ${record.lastUpdated ? `<dt>Last Updated</dt><dd>${escapeHtml(formatDate(record.lastUpdated))}</dd>` : ""}
                        <dt>Retrieved</dt><dd>${escapeHtml(formatDate(record.retrievedDate))}</dd>
                    </dl>
                    <a class="intel-source-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noopener noreferrer">Read Original Source →</a>
                </div>
            `;
        } else if(trust.sourceStatus === "SOURCE_WARNING"){
            sourceBlock = `
                <div class="intel-source-block intel-source-block--warning">
                    <p class="intel-security-notice"><strong>Security Notice:</strong> GPIR could not confirm this link's destination matches the declared source (${escapeHtml((trust.reasons || []).join(", ").replace(/_/g," ").toLowerCase() || "unspecified")}). Destination: <code>${escapeHtml(record.source.url)}</code>. Please proceed only if you trust the destination.</p>
                    <a class="intel-source-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noopener noreferrer">Open this link anyway →</a>
                </div>
            `;
        } else {
            sourceBlock = `
                <div class="intel-source-block intel-source-block--pending">
                    <p>A single authoritative primary source with a verifiable publication date has not yet been confirmed for this item. GPIR does not publish an original-source link until source verification is complete.</p>
                </div>
            `;
        }

        const summaryBlock = record.summary ? `<p class="intel-summary">${escapeHtml(record.summary)}</p>` : "";
        const lifecycleBlock = lifecycleFacts(record);
        const whyBlock = record.whyItMatters ? `
            <section id="why-it-matters">
                <div class="intel-why">
                    <h4>Why It Matters</h4>
                    <p>${escapeHtml(record.whyItMatters)}</p>
                </div>
            </section>
        ` : "";

        const gpirButton = record.gpirMapping ? `
            <div class="intel-reader-view">
                <h4>GPIR Reader View</h4>
                <a class="intel-gpir-link" href="../../${escapeHtml(record.gpirMapping.href)}">Explore Related GPIR Intelligence →</a>
            </div>
        ` : "";

        const related = relatedRecords(record);
        const relatedBlock = related.length ? `
            <section id="related">
                <div class="intel-related">
                    <h4>Related GPIR Intelligence</h4>
                    <ul class="intel-related-list">
                        ${related.map(r => `<li><a class="intel-related-item" href="${escapeHtml(r.id)}.html">${escapeHtml(r.country)} · ${escapeHtml(r.tickerHeadline || r.title)}</a></li>`).join("")}
                    </ul>
                </div>
            </section>
        ` : "";

        const reportBlock = `
            <div class="intel-report-block">
                <p>Spotted an issue with this record?
                    ${REPORT_REASONS.map(reason => `<a class="intel-report-reason" href="${escapeHtml(buildReportMailto(record, reason))}">${escapeHtml(reason)}</a>`).join(" &middot; ")}
                </p>
            </div>
        `;

        const tocLinks = ['<li><a href="#summary">Summary</a></li>'];
        if(record.whyItMatters) tocLinks.push('<li><a href="#why-it-matters">Why It Matters</a></li>');
        tocLinks.push('<li><a href="#source">Source</a></li>');
        if(related.length) tocLinks.push('<li><a href="#related">Related Intelligence</a></li>');

        const heroAndBody = `<section class="chapter-hero">
    <div class="container">

        <div class="chapter-breadcrumb">
            <a href="../../index.html">Home</a>
            <span>/</span>
            <a href="../../index.html#market-ribbon">Global Announcements</a>
            <span>/</span>
            <strong>${escapeHtml(record.tickerHeadline || record.title)}</strong>
        </div>

        <span class="chapter-part-tag">${escapeHtml(record.category)}${record.subCategory ? " / " + escapeHtml(record.subCategory) : ""}</span>

        <h1>${escapeHtml(record.title)}</h1>

        <p class="chapter-hero-intro">${escapeHtml(record.tickerHeadline || "")}</p>

    </div>
</section>

<section class="chapter-body">
    <div class="container">
        <div class="chapter-layout">

            <aside class="chapter-toc">
                <span class="chapter-toc-label">On This Page</span>
                <ul>
                    ${tocLinks.join("\n                    ")}
                </ul>
            </aside>

            <div class="chapter-content" id="chapter-content">

<section id="summary">

    <div class="intel-detail-meta">
        <span class="intel-detail-flag">${flagMarkup}</span>
        <span class="intel-detail-country">${escapeHtml(record.country)}${record.region && record.region !== record.country ? " · " + escapeHtml(record.region) : ""}</span>
        <span class="intel-detail-category">${escapeHtml(record.category)}${record.subCategory ? " / " + escapeHtml(record.subCategory) : ""}</span>
    </div>

    <div class="intel-badges">${badges}</div>

    ${lifecycleBlock}

    <h2 class="intel-summary-heading">GPIR Summary</h2>
    ${summaryBlock}

</section>

${whyBlock}

<section id="source">
    <h2 class="intel-summary-heading">Source</h2>
    ${sourceBlock}
    ${gpirButton}
</section>

${relatedBlock}

${reportBlock}

<p class="intel-disclaimer">GPIR checks source domains against a maintained registry and basic domain-pattern checks — this is a source-verification status, not a guarantee of safety. Always use judgment before entering any information on an external site. GPIR will never ask you for passwords, OTPs, card details or wallet credentials.</p>

            </div>

        </div>
    </div>
</section>

`;

        const finalHtml = headerBlock + heroAndBody + footerBlock;

        const outPath = path.join(stagedOutputDir, `${record.id}.html`);
        fs.writeFileSync(outPath, finalHtml.replace(/[ \t]+$/gm, ""), "utf8");
        generatedCount += 1;
        console.log(`Staged ${path.join(OUTPUT_DIR, `${record.id}.html`)} (source status: ${trust.sourceStatus})`);

    });

    console.log(`\n${generatedCount} intelligence summary page(s) generated in ${OUTPUT_DIR}`);

    const skipped = allRecords.filter(r => !recordsById[r.id]);
    if(skipped.length){
        console.log(`${skipped.length} record(s) not published (status not GPIR_CLASSIFIED, or trust-blocked) -- no page generated:`);
        skipped.forEach(r => console.log(`  - ${r.id} (status: ${r.status})`));
    }

    const homepageSource = fs.readFileSync(HOMEPAGE_SOURCE_PATH, "utf8");
    const homepageFooterStart = homepageSource.indexOf("<footer id=\"footer\">");
    if(homepageFooterStart === -1) throw new Error("Homepage footer marker not found");
    const sharedFooter = homepageSource.slice(homepageFooterStart, homepageSource.indexOf("</html>", homepageFooterStart));
    const sharedFooterBlock = sharedFooter.replace(/(href|src)=\"([^\"]+)\"/g, (match, attribute, value) => {
        if(/^(https?:|mailto:)/.test(value)) return match;
        if(value === "index.html") return `${attribute}=\"../../index.html\"`;
        if(value.startsWith("#")) return `${attribute}=\"../../index.html${value}\"`;
        return `${attribute}=\"../../${value}\"`;
    });

    const sitemapStaged = updateSitemap(publicRecords, allRecords, stagedSitemapPath);
    generateArchive(allRecords, publishedRecords, sharedFooterBlock, headerBlockTemplate, {
        TEMPLATE_TITLE_TAG, TEMPLATE_DESCRIPTION, TEMPLATE_CANONICAL_URL, TEMPLATE_OG_TWITTER_TITLE
    }, stagedOutputDir);

    const artifacts = publicRecords.map(record => ({
        staged: path.join(stagedOutputDir, `${record.id}.html`),
        target: path.join(OUTPUT_DIR, `${record.id}.html`)
    }));
    artifacts.push({
        staged: path.join(stagedOutputDir, "index.html"),
        target: path.join(OUTPUT_DIR, "index.html")
    });
    if(sitemapStaged) artifacts.push({ staged: stagedSitemapPath, target: SITEMAP_PATH });

    promoteStagedArtifacts(stagingRoot, artifacts);
    console.log(`Promoted ${artifacts.length} complete generated artifact(s).`);
    } finally {
        fs.rmSync(stagingRoot, { recursive: true, force: true });
    }

}

function archiveCard(record){
    const flagMarkup = record.countryCode
        ? `<img class="flag-icon" src="../../assets/icons/flags/${escapeHtml(record.countryCode)}.svg" alt="" loading="lazy">`
        : '<svg class="icon-globe" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>';
    const summary = record.summary || record.tickerHeadline || record.title;
    const pubDate = formatDate(record.publicationDate || record.publishedDate);
    return `
    <li class="announcement-archive-card">
      <div class="announcement-card-flag">${flagMarkup}</div>
      <div class="announcement-card-body">
        <div class="announcement-card-meta-row">
          <span>${escapeHtml(record.country || "Global")}</span>
          <span>${escapeHtml(record.category || "Announcement")}</span>
          <span>${escapeHtml(pubDate)}</span>
        </div>
        <h3><a href="${escapeHtml(record.id)}.html">${escapeHtml(record.tickerHeadline || record.title)}</a></h3>
        <p class="announcement-card-summary">${escapeHtml(summary)}</p>
        <div class="announcement-card-status-row">
          <span class="announcement-card-status">${escapeHtml(record.lifecycleStatus || "CURRENT")}</span>
          ${record.source && record.source.url ? `<a class="announcement-card-link" href="${escapeHtml(record.source.url)}" target="_blank" rel="noopener noreferrer">Original Source</a>` : ""}
        </div>
      </div>
    </li>`;
}

function generateArchive(allRecords, publishedRecords, footerBlock, headerBlockTemplate, templateMarkers, outputDir){
    const pending = allRecords.filter(record => record.status !== "GPIR_CLASSIFIED");

    // Reuses the same shared head/header markup as every generated intelligence
    // detail page (extracted from pages/legal/privacy-policy.html) instead of a
    // hand-rolled minimal <head> -- fixes the archive rendering with raw/default
    // browser styling because it was missing header.css, typography.css and the
    // rest of the shared CSS stack.
    const archiveUrl = `${SITE_ORIGIN}/pages/intelligence/index.html`;
    const archiveDescription = "A structured archive of GPIR-classified announcement records, preserving current publication status, historical supersessions and records awaiting full source verification.";
    let archiveHeaderBlock = headerBlockTemplate;
    archiveHeaderBlock = archiveHeaderBlock.split(templateMarkers.TEMPLATE_TITLE_TAG).join("<title>Global Announcements | FINTECHOISIS — GPIR</title>");
    archiveHeaderBlock = archiveHeaderBlock.split(templateMarkers.TEMPLATE_DESCRIPTION).join(escapeHtml(archiveDescription));
    archiveHeaderBlock = archiveHeaderBlock.split(templateMarkers.TEMPLATE_CANONICAL_URL).join(archiveUrl);
    archiveHeaderBlock = archiveHeaderBlock.split(templateMarkers.TEMPLATE_OG_TWITTER_TITLE).join('content="Global Announcements">');

    const html = `${archiveHeaderBlock}<section class="chapter-hero">
    <div class="container">
        <div class="chapter-breadcrumb"><a href="../../index.html">Home</a><span>/</span><strong>Global Announcements</strong></div>
        <span class="chapter-part-tag">Reader Archive</span>
        <h1>Global Announcements</h1>
        <p class="chapter-hero-intro">A structured archive of GPIR-classified announcement records, preserving current publication status, historical supersessions and records awaiting full source verification.</p>
        <p class="announcement-archive-freshness"><strong>Last validated publication cycle:</strong> ${escapeHtml(formatDate(allRecords.map(record => record.retrievedDate).filter(Boolean).sort().pop()))} · <strong>Candidate discovery automation:</strong> Scheduled ${escapeHtml(describeDiscoveryCadence())} via GitHub Actions · publication remains human-reviewed</p>
        <nav class="announcement-archive-nav" aria-label="Global Announcements sections">
          <span>Jump to</span>
          <a href="#latest-24-hours">LIVE</a>
          <!-- No separate "recent" data grouping exists (only live vs.
               archive), so RECENT and ARCHIVE both open the repository
               archive below, which already lists newest-first -- this
               links there rather than fabricating a third bucket. -->
          <a href="#historical-publications">RECENT</a>
          <a href="#historical-publications">ARCHIVE</a>
        </nav>
    </div>
</section>
<section class="chapter-body">
    <div class="container announcement-archive-wrap">
      <section class="announcement-dashboard" data-announcement-dashboard data-source="../../assets/data/announcements.json">
        <div class="announcement-dashboard-heading"><div><h2>Live-to-archive intelligence</h2><p>Validated records appear live only when their exact source publication timestamp is inside the latest 24 hours. All older validated records remain searchable and discoverable here.</p></div><strong data-counts>Loading validated records…</strong></div>
        <form class="announcement-dashboard-filters" aria-label="Announcement archive filters" onsubmit="return false">
          ${["region", "country", "category", "subcategory"].map(field => `<label>${escapeHtml(field.charAt(0).toUpperCase() + field.slice(1))}<select data-filter="${field}"><option value="">All</option></select></label>`).join("")}
          <label>From date<input type="date" data-filter="from"></label><label>To date<input type="date" data-filter="to"></label>
          <button type="button" data-reset>Reset filters</button>
        </form>
        <div class="announcement-dashboard-stats" data-stats aria-live="polite"></div>
        <section id="latest-24-hours"><h2>Latest 24 hours</h2><div class="announcement-dashboard-grid" data-live></div></section>
        <section id="historical-publications"><h2>Repository archive</h2><div data-archive></div></section>
        ${pending.length ? `<p class="announcement-dashboard-pending"><strong>${pending.length}</strong> developing record(s) remain excluded from public results pending source and publication validation.</p>` : ""}
      </section>
    </div>
</section>
${footerBlock}
<script src="../../assets/js/announcement-lifecycle.js?v=20260909a"></script>
<script src="../../assets/js/announcement-dashboard.js?v=20260909a"></script>
</body>
</html>`;
    fs.writeFileSync(path.join(outputDir, "index.html"), html.replace(/[ \t]+$/gm, ""), "utf8");
    console.log(`Staged ${path.join(OUTPUT_DIR, "index.html")} (published: ${publishedRecords.length}, developing: ${pending.length})`);
}

// Rebuilds current entries while retaining an existing sitemap entry for a
// record now marked HISTORICAL. A later source/trust reclassification must
// not make a previously published historical URL undiscoverable.
function updateSitemap(published, allRecords, outputPath){

    if(!fs.existsSync(SITEMAP_PATH)){
        console.log("sitemap.xml not found -- skipping sitemap update.");
        return false;
    }

    let sitemap = fs.readFileSync(SITEMAP_PATH, "utf8");
    const historicalUrls = new Set(allRecords
        .filter(record => record.lifecycleStatus === "HISTORICAL" && record.publicationDate)
        .map(record => `${SITE_ORIGIN}/pages/intelligence/${record.id}.html`));
    const retainedHistoricalUrls = new Set();

    const urlBlockRe = /\r?\n?    <url>\s*\r?\n\s*<loc>[^<]*<\/loc>[\s\S]*?<\/url>\r?\n/g;
    sitemap = sitemap.replace(urlBlockRe, block => {
        if(!block.includes("/pages/intelligence/")) return block;
        const loc = (block.match(/<loc>\s*([^<]+)\s*<\/loc>/) || [])[1];
        if(loc && historicalUrls.has(loc)){
            retainedHistoricalUrls.add(loc);
            return block;
        }
        return "";
    });
    sitemap = sitemap.replace(/\n{4,}/g, "\n\n\n");

    const today = new Date().toISOString().slice(0, 10);
    const archiveEntry = `
    <url>
        <loc>${SITE_ORIGIN}/pages/intelligence/index.html</loc>
        <lastmod>${today}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>`;
    const entries = archiveEntry + published
        .filter(record => !retainedHistoricalUrls.has(`${SITE_ORIGIN}/pages/intelligence/${record.id}.html`))
        .map(r => `
    <url>
        <loc>${SITE_ORIGIN}/pages/intelligence/${r.id}.html</loc>
        <lastmod>${r.lastUpdated || r.retrievedDate || today}</lastmod>
        <changefreq>monthly</changefreq>
        <priority>0.6</priority>
    </url>`).join("\n");

    if(!sitemap.includes("</urlset>")){
        console.log("sitemap.xml has no </urlset> closing tag -- skipping sitemap update.");
        return false;
    }

    sitemap = sitemap.replace("</urlset>", entries + "\n\n</urlset>").replace(/\n{4,}/g, "\n\n\n");
    fs.writeFileSync(outputPath, sitemap, "utf8");
    console.log(`Staged sitemap with ${published.length} current/public entries and ${retainedHistoricalUrls.size} retained historical entry/entries.`);
    return true;

}

main();

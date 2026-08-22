/*=====================================================
  GPIR STRUCTURED CONTENT ADAPTER

  Pure, dependency-free conversion functions between the unified content
  object shape (assets/data/content/**, docs/CONTENT_SCHEMA.md) and the
  exact shapes the site's *existing* rendering paths already consume:

    toWorldMapEntry(obj)        -> the {name, region, lat, lon, status, url}
                                    shape assets/js/world-map.js reads from
                                    assets/data/world-map-countries.json.

    toAnnouncementRecord(obj)   -> the record shape
                                    assets/data/announcements.json already
                                    uses, which scripts/generate-intelligence-
                                    pages.js and assets/js/announcements.js
                                    both consume.

  Nothing here is wired into a live page. This is Implementation 04's
  compatibility proof: a unified content object converts, losslessly,
  back into what the existing architecture already expects -- see
  docs/CONTENT_SCHEMA.md §5 and the verification report for how this was
  checked against the real, live data files.

  Run directly to re-verify both conversions against the live data:
    node scripts/content-object-adapter.js
======================================================*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

function toWorldMapEntry(obj){
    const t = obj.typeSpecific || {};
    return {
        name: t.mapName,
        region: t.subRegion,
        lat: t.lat,
        lon: t.lon,
        status: t.mapStatus,
        url: obj.renderingTarget,
    };
}

function toAnnouncementRecord(obj){
    const t = obj.typeSpecific || {};
    const statusMap = { PUBLISHED: "GPIR_CLASSIFIED" };
    const relatedCountryHref = (obj.relatedContent || []).find(href => href.includes("/countries/")) || null;

    return {
        id: obj.slug,
        status: statusMap[obj.status] || obj.status,
        title: obj.title,
        tickerHeadline: t.tickerHeadline,
        category: t.category,
        subCategory: t.subCategory,
        country: obj.country,
        countryCode: t.countryCode,
        region: obj.region,
        eventType: t.eventType,
        publishedDate: obj.publicationDate,
        retrievedDate: t.retrievedDate,
        sourceOrgId: t.sourceOrgId,
        contentStatus: t.contentStatus,
        audit: t.audit,
        organisation: t.organisation,
        lastUpdated: obj.lastUpdated,
        source: obj.source ? {
            name: obj.source.name,
            tier: obj.source.tier,
            publicationTitle: t.publicationTitle,
            url: obj.source.url,
        } : null,
        summary: obj.summary,
        whyItMatters: obj.description,
        gpirMapping: {
            header: obj.topic,
            subHeader: obj.subtopic,
            href: t.chapterHref,
        },
        relatedCountryHref,
    };
}

function deepEqual(a, b){
    return JSON.stringify(a) === JSON.stringify(b);
}

function diffKeys(a, b, label){
    const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
    const diffs = [];
    for(const k of keys){
        if(JSON.stringify(a ? a[k] : undefined) !== JSON.stringify(b ? b[k] : undefined)){
            diffs.push(`  ${label}.${k}:\n    adapter: ${JSON.stringify(a ? a[k] : undefined)}\n    live:    ${JSON.stringify(b ? b[k] : undefined)}`);
        }
    }
    return diffs;
}

if(require.main === module){

    console.log("=== 1. Country adapter vs live world-map-countries.json ===");
    const uaeObj = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/content/countries/uae.json"), "utf8"));
    const worldMapData = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/world-map-countries.json"), "utf8"));
    const liveUae = worldMapData.countries.find(c => c.url === "pages/countries/uae.html");
    const derivedUae = toWorldMapEntry(uaeObj);
    console.log("adapter output:", JSON.stringify(derivedUae));
    console.log("live entry:    ", JSON.stringify(liveUae));
    if(deepEqual(derivedUae, liveUae)){
        console.log("PASS: field-for-field identical to the live world-map-countries.json UAE entry.\n");
    } else {
        console.log("FAIL: mismatch --", diffKeys(derivedUae, liveUae, "worldMapEntry").join("\n"), "\n");
        process.exitCode = 1;
    }

    console.log("=== 2. Intelligence adapter vs live announcements.json record ===");
    const intelObj = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/content/intelligence/cbuae-payment-token-2026.json"), "utf8"));
    const announcementsData = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/announcements.json"), "utf8"));
    const liveRecord = announcementsData.records.find(r => r.id === "cbuae-payment-token-2026");
    const derivedRecord = toAnnouncementRecord(intelObj);
    if(deepEqual(derivedRecord, liveRecord)){
        console.log("PASS: field-for-field identical to the live announcements.json record.\n");
    } else {
        console.log("FAIL: mismatch --\n" + diffKeys(derivedRecord, liveRecord, "record").join("\n") + "\n");
        process.exitCode = 1;
    }
}

module.exports = { toWorldMapEntry, toAnnouncementRecord };

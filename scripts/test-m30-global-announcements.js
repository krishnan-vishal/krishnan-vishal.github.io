#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const lifecycle = require("../assets/js/announcement-lifecycle.js");
const archive = require("../assets/js/announcement-dashboard.js");
const { announcementEntries } = require("../assets/js/content-search.js");
const { eventFingerprint } = require("./propose-intelligence-candidates.js");
const { publish, validationFailures } = require("./publish-intelligence-candidates.js");

const ROOT = path.resolve(__dirname, "..");
const data = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/data/announcements.json"), "utf8"));
const published = data.records.filter(lifecycle.isPublished);
const tickerSource = fs.readFileSync(path.join(ROOT, "assets/js/announcements.js"), "utf8");
const tickerCss = fs.readFileSync(path.join(ROOT, "assets/css/page.css"), "utf8");
const archiveCss = fs.readFileSync(path.join(ROOT, "assets/css/chapter-page.css"), "utf8");
const archivePage = fs.readFileSync(path.join(ROOT, "pages/intelligence/index.html"), "utf8");
const archiveRuntime = fs.readFileSync(path.join(ROOT, "assets/js/announcement-dashboard.js"), "utf8");
const askRuntime = fs.readFileSync(path.join(ROOT, "assets/js/script.js"), "utf8");
let checks = 0;
const check = (condition, message) => { assert.ok(condition, message); checks += 1; };

// 1-2: one canonical sequence is cloned once for a measured, seamless loop.
check(tickerSource.includes('class="ticker-sequence"') && tickerSource.includes("cloneNode(true)"), "continuous ticker must use a repeated measured sequence");
check(!tickerSource.includes("sequenceHTML + sequenceHTML") && tickerSource.match(/tickerRecords\.map/g).length === 1, "records must be rendered once per canonical sequence before cloning");
check(tickerSource.includes('aria-hidden", "true"') && tickerSource.includes('tabindex", "-1"'), "repeated sequence must not duplicate accessibility focus targets");
check(/animation:announcementTickerLoop/.test(tickerCss) && /--announcement-ticker-distance/.test(tickerCss), "ticker must animate by its measured canonical sequence width");
check(/#market-ribbon \.ticker-wrapper[\s\S]*?overflow:hidden/.test(tickerCss), "ticker viewport must hide overflow without a scrollbar");

// 3-5: source publication evidence, not GPIR processing time, controls LIVE.
const recent = { status: "GPIR_CLASSIFIED", contentStatus: "CONTENT_VERIFIED", lifecycleStatus: "CURRENT", publicationDate: "2026-09-10", publicationTime: "08:00:00Z", publishedAt: "2026-01-01T00:00:00Z" };
const stale = { ...recent, publicationDate: "2026-09-01", publishedAt: "2026-09-10T08:30:00Z" };
check(lifecycle.isLive(recent, new Date("2026-09-10T09:00:00Z")), "record inside the authoritative-source 24-hour window must be LIVE");
check(!lifecycle.isLive(stale, new Date("2026-09-10T09:00:00Z")), "stale source record must never become LIVE because GPIR processed it recently");
check(!/Last validated publication cycle:|backend timestamp|hard-coded current date/i.test(archivePage), "reader must not expose a hard-coded current date or fake refresh time");

// 6-8: Month/Year counts and filtering operate on the local canonical snapshot.
const periods = archive.periodCounts(data.records, lifecycle);
const year2026 = periods.find(period => period.year === "2026");
check(year2026 && year2026.count === published.length, "Year count must equal the canonical published corpus");
check(year2026.months.some(month => month.month === "09" && month.count === 1), "September count must be generated from canonical records");
check(archive.filterRecords(data.records, { year: "2026", month: "09", region: "", country: "", category: "", subcategory: "" }, lifecycle).length === 1, "Month/Year selection must filter canonical records immediately");
check(archivePage.includes("data-canonical-announcements") && !archiveRuntime.includes("fetch("), "archive filtering must use its generated canonical snapshot without a runtime fetch");

// 9-16: last-known-good, zero, isolation, deduplication, T1 and exception gates.
check(archivePage.includes("data-archive") && archivePage.includes("announcement-dashboard-card"), "server-rendered last-known-good archive must remain usable without JavaScript");
const source = { id: "m30-authority", organization: "M30 Authority", officialDomains: ["authority.example"], country: "Example", region: "APAC", tier: 1, sourceRole: "PRIMARY", sourceType: "Central Bank / Regulator", active: true, sourceTrustStatus: "VERIFIED_OFFICIAL", refreshEndpoint: "https://authority.example/feed", refreshEndpointType: "RSS" };
const candidate = { id: "candidate-m30-proof", referenceId: "candidate-m30-proof", title: "Authority launches instant payment settlement framework", summary: "Official instant payment settlement framework.", sourceOrgId: source.id, sourceUrl: "https://authority.example/notices/instant-payment", discoveryEndpoint: source.refreshEndpoint, sourcePublicationDate: "2026-09-10", sourcePublicationDateRaw: "2026-09-10T08:00:00Z", retrievedAt: "2026-09-10T08:30:00Z", region: "APAC", status: "PENDING_HUMAN_REVIEW", publicationStatus: "NOT_PUBLISHED" };
const health = { sourceId: source.id, healthState: "GREEN" };
const zero = publish({ sources: [source], candidates: [], announcements: published, contentRegistry: [], sourceHealth: [health], now: new Date("2026-09-10T09:00:00Z") });
check(zero.promotedIds.length === 0 && zero.announcements.length === published.length, "zero-result discovery must succeed with the published corpus retained");
check(validationFailures(candidate, source, [], { ...health, healthState: "AMBER" }).includes("SOURCE_NOT_HEALTHY_IN_CURRENT_CYCLE"), "one unavailable source must be isolated from publication");
check(validationFailures(candidate, source, [{ sourceUrl: candidate.sourceUrl }], health).includes("DUPLICATE_SOURCE_URL"), "duplicate URL must be suppressed");
const fingerprint = eventFingerprint({ title: candidate.title, publicationDate: candidate.sourcePublicationDate });
check(validationFailures({ ...candidate, eventFingerprint: fingerprint }, source, [{ eventFingerprint: fingerprint }], health).includes("DUPLICATE_EVENT"), "duplicate event must be suppressed");
const promoted = publish({ sources: [source], candidates: [candidate], announcements: [], contentRegistry: [], sourceHealth: [health], now: new Date("2026-09-10T09:00:00Z") });
check(promoted.promotedIds.length === 1 && promoted.announcements.length === 1, "eligible T1 publication must pass every deterministic gate");
const dateOnly = { ...candidate, sourcePublicationDateRaw: "2026-09-10" };
const exception = publish({ sources: [source], candidates: [dateOnly], announcements: [], contentRegistry: [], sourceHealth: [health], now: new Date("2026-09-10T09:00:00Z") });
check(exception.promotedIds.length === 0 && exception.candidates.length === 1 && exception.quarantined[0].failures.includes("PUBLICATION_TIMESTAMP_INVALID"), "inexact publication timestamp must remain in the exception queue");
check(lifecycle.partition(published, new Date("2100-01-01T00:00:00Z")).archive.length === published.length, "archive retention must preserve every expired record");

// 17-20: the shared canonical corpus remains wired to Search/ASK and compact UI.
check(announcementEntries(data).length === published.length, "Search GPIR must index every canonical published announcement");
check(askRuntime.includes("answerAnnouncementQuery") && lifecycle.query(data.records, "payment").length > 0, "ASK GPIR must resolve against the canonical published announcement corpus");
check(/font-size:13px/.test(archiveCss) && /text-overflow:ellipsis/.test(archiveCss) && /@media \(max-width:760px\)/.test(archiveCss), "announcement layout must remain compact, truncated and responsive");
check(archivePage.includes("data-period-nav") && !archivePage.includes('type="date"'), "Month/Year navigation must replace the large date-range workflow");

console.log(`M30 Global Announcements production-closure tests passed: ${checks} checks; ${published.length} canonical published records indexed by archive/Search/ASK.`);

// GPIR M39 — public-source discovery helpers (proposal-only; no database writes).
// GDELT is a discovery index, NOT the publisher or an authoritative source.
const GDELT_ENDPOINT = "https://api.gdeltproject.org/api/v2/doc/doc";
const BIS_API_DOCS = "https://stats.bis.org/api-doc/v2/";
const TOPICS = Object.freeze({
  remittances: '"remittances" OR "money transfer"',
  bnpl: '"buy now pay later" OR "BNPL"',
  wallets: '"digital wallet" OR "mobile money"',
  payments: '"cross-border payments" OR "instant payments"'
});
function gdeltQueryUrl(topic, { start, end, maxRecords = 50 } = {}) {
  if (!Object.hasOwn(TOPICS, topic)) throw new Error("UNAPPROVED_GDELT_TOPIC");
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 250) throw new Error("INVALID_MAX_RECORDS");
  const u = new URL(GDELT_ENDPOINT);
  u.searchParams.set("query", TOPICS[topic]);
  u.searchParams.set("mode", "artlist");
  u.searchParams.set("format", "json");
  u.searchParams.set("sort", "datedesc");
  u.searchParams.set("maxrecords", String(maxRecords));
  if (start || end) {
    if (!start || !end || !/^\d{14}$/.test(start) || !/^\d{14}$/.test(end) || start >= end)
      throw new Error("INVALID_DATE_WINDOW");
    u.searchParams.set("startdatetime", start);
    u.searchParams.set("enddatetime", end);
  } else u.searchParams.set("timespan", "24h");
  return u.toString();
}
function gdeltDiscoveryCandidates(payload, topic) {
  if (!Object.hasOwn(TOPICS, topic)) throw new Error("UNAPPROVED_GDELT_TOPIC");
  const seen = new Set();
  return (Array.isArray(payload?.articles) ? payload.articles : []).flatMap(item => {
    let url;
    try {
      url = new URL(item.url);
      if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return [];
    } catch { return []; }
    const canonical = url.toString();
    if (seen.has(canonical) || !item.title || !/^\d{14}$/.test(String(item.seendate || ""))) return [];
    seen.add(canonical);
    const stamp = String(item.seendate);
    const discoveredAt = stamp.slice(0,4)+"-"+stamp.slice(4,6)+"-"+stamp.slice(6,8)+"T"+stamp.slice(8,10)+":"+stamp.slice(10,12)+":"+stamp.slice(12,14)+"Z";
    if (Number.isNaN(Date.parse(discoveredAt))) return [];
    return [{
      discoverySource: "GDELT", topic, title: String(item.title).slice(0,400),
      originalUrl: canonical, originalDomain: url.hostname,
      gdeltSeenAt: discoveredAt, sourcePublicationTimestamp: null,
      publicationStatus: "NOT_PUBLISHED", verificationStatus: "SOURCE_VERIFICATION_REQUIRED"
    }];
  });
}
// BIS SDMX is statistical reference data. Never label it as licensing decisions or live news.
// A specific SDMX dataflow, dimensions and reuse rights must be approved before extraction.
function bisSourceDescriptor() {
  return Object.freeze({ provider: "BIS", docs: BIS_API_DOCS,
    dataClass: "STATISTICAL_REFERENCE", requiresApprovedDataflow: true,
    publicationStatus: "NOT_PUBLISHED" });
}
module.exports = { GDELT_ENDPOINT, BIS_API_DOCS, TOPICS, gdeltQueryUrl, gdeltDiscoveryCandidates, bisSourceDescriptor };

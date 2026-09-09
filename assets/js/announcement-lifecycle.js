/* GPIR Global Announcements deterministic live/archive lifecycle. */
(function(root, factory){
    const api = factory();
    if(typeof module === "object" && module.exports) module.exports = api;
    if(root) root.GPIRAnnouncementLifecycle = api;
})(typeof window !== "undefined" ? window : globalThis, function(){
    const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

    function publicationInstant(record){
        const explicit = record && (record.publishedAt || record.publicationTimestamp);
        if(explicit && !Number.isNaN(Date.parse(explicit))) return new Date(explicit);
        const date = record && (record.publicationDate || record.publishedDate);
        const time = record && record.publicationTime;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !/^\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:\d{2})$/.test(time || "")) return null;
        const instant = new Date(`${date}T${time}`);
        return Number.isNaN(instant.getTime()) ? null : instant;
    }

    function isPublished(record){
        return Boolean(record && record.status === "GPIR_CLASSIFIED" && record.contentStatus !== "CONTENT_UNDER_REVIEW" && record.lifecycleStatus !== "DEVELOPING");
    }

    function isLive(record, now = new Date()){
        if(!isPublished(record)) return false;
        const published = publicationInstant(record);
        if(!published) return false;
        const age = now.getTime() - published.getTime();
        return age >= 0 && age < LIVE_WINDOW_MS;
    }

    function partition(records, now = new Date()){
        const published = (records || []).filter(isPublished);
        const live = published.filter(record => isLive(record, now));
        const liveIds = new Set(live.map(record => record.id));
        return {
            live,
            archive: published.filter(record => !liveIds.has(record.id)),
            developing: (records || []).filter(record => !isPublished(record))
        };
    }

    function searchableText(record){
        return [
            record.headline, record.title, record.tickerHeadline, record.summary,
            record.country, record.region, record.category,
            record.subcategory, record.subCategory,
            record.publicationDate, record.publishedDate,
            record.sourceName, record.source && record.source.name,
            record.gpirSection, record.gpirSubsection,
            ...(record.tags || []), ...(record.keywords || [])
        ].filter(Boolean).join(" ").toLowerCase();
    }

    function query(records, rawQuery){
        const stop = new Set(["a","an","and","in","of","on","the","to","for","from","latest","change","changes","update","updates","announcement","announcements"]);
        const tokens = String(rawQuery || "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter(token => token.length > 1 && !stop.has(token));
        if(!tokens.length) return [];
        return (records || []).filter(isPublished).map(record => {
            const text = searchableText(record);
            const matches = tokens.filter(token => text.includes(token));
            return { record, score: matches.length, required: Math.max(1, Math.ceil(tokens.length * 0.6)) };
        }).filter(item => item.score >= item.required)
            .sort((left, right) => right.score - left.score || String(right.record.publicationDate || right.record.publishedDate || "").localeCompare(String(left.record.publicationDate || left.record.publishedDate || "")))
            .map(item => item.record);
    }

    return { LIVE_WINDOW_MS, publicationInstant, isPublished, isLive, partition, searchableText, query };
});

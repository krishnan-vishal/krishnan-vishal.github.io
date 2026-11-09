// Ingestion hygiene for official sources. Pure functions: no network, no source-trust change.

// The ECB serves one site-wide meta description on every press page. It describes the
// institution, not the item, so it must never be stored as article evidence or scored.
const ECB_SITE_DESCRIPTION = /^the european central bank \(ecb\) is the central bank of the european union countries which have adopted the euro\b/i;

export function articleSpecificDescription(sourceId, description) {
    const text = String(description || '').trim();
    if (!text) return null;
    if (sourceId === 'CB-EUR-001' && ECB_SITE_DESCRIPTION.test(text)) return null;
    return text;
}

// ECB feeds and canonical links can carry "//press/..." paths. The same article would
// otherwise fingerprint twice and create duplicate candidates.
export function collapseOfficialPathSlashes(value, hostname) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.hostname !== hostname || url.username || url.password) return value;
        url.pathname = url.pathname.replace(/\/{2,}/g, '/');
        url.hash = '';
        return url.toString();
    } catch {
        return value;
    }
}

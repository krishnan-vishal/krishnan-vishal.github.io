import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/+esm";

const SUPABASE_URL = "https://qlnvhfapctcpzqyuhhth.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_WXg6w9pZIWatIraPV1mUVQ_JAUZ7PQ6";
const DATA_URL = "assets/data/announcements.json";
const ARCHIVE_URL = "pages/intelligence/index.html";
const RECORD_LIMIT = 20;
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const FULL_COLUMNS = "source_id,title,canonical_url,url,published_at,summary_narration";
const BASE_COLUMNS = "source_id,title,canonical_url,url,published_at";

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function safeSourceUrl(value) {
    try {
        const url = new URL(String(value || ""));
        if (url.protocol !== "https:" || url.username || url.password) return null;
        return url.href;
    } catch {
        return null;
    }
}

function publishedInstant(value) {
    const timestamp = Date.parse(cleanText(value));
    return Number.isFinite(timestamp) ? timestamp : null;
}

function formatUtcTime(value) {
    const timestamp = publishedInstant(value);
    if (timestamp === null) return "TIME N/A";
    return new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC"
    }).format(new Date(timestamp)).toUpperCase() + " UTC";
}

function lifecycleFor(value, now = Date.now()) {
    const timestamp = publishedInstant(value);
    if (timestamp === null) return "APPROVED";
    const age = now - timestamp;
    return age >= 0 && age <= LIVE_WINDOW_MS ? "LIVE" : "ARCHIVE";
}

function normalizeSupabaseRows(input, now = Date.now()) {
    if (!Array.isArray(input)) return [];
    return input.map((record, index) => {
        const title = cleanText(record && record.title);
        if (!title) return null;
        const publishedAt = cleanText(record.published_at);
        return {
            id: `supabase-${index}`,
            title,
            summary: cleanText(record.summary_narration),
            sourceLabel: cleanText(record.source_id).toUpperCase() || "GLOBAL",
            sourceUrl: safeSourceUrl(record.canonical_url || record.url),
            publishedAt,
            timeLabel: formatUtcTime(publishedAt),
            lifecycle: lifecycleFor(publishedAt, now),
            detailUrl: null
        };
    }).filter(Boolean);
}

function canonicalPublicationInstant(record) {
    const date = cleanText(record.sourcePublicationDate || record.publicationDate || record.publishedDate);
    const time = cleanText(record.sourcePublicationTime || record.publicationTime);
    if (!date) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && time) return `${date}T${time}`;
    return date;
}

function normalizeCanonicalRows(payload, now = Date.now()) {
    const records = payload && Array.isArray(payload.records) ? payload.records : [];
    return records.filter(record => record && record.status === "GPIR_CLASSIFIED")
        .slice(0, RECORD_LIMIT)
        .map(record => {
            const publishedAt = canonicalPublicationInstant(record);
            const source = record.source || {};
            return {
                id: cleanText(record.id),
                title: cleanText(record.headline || record.tickerHeadline || record.title),
                summary: cleanText(record.summary || record.whyItMatters),
                sourceLabel: cleanText(record.countryCode || record.region || record.country).toUpperCase() || "GLOBAL",
                sourceUrl: safeSourceUrl(record.sourceUrl || source.url),
                publishedAt,
                timeLabel: formatUtcTime(publishedAt),
                lifecycle: lifecycleFor(publishedAt, now),
                detailUrl: record.id ? `pages/intelligence/${encodeURIComponent(record.id)}.html` : null
            };
        }).filter(record => record.title);
}

function runAnnouncementQuery(client, columns, limit) {
    return client.from("global_announcements")
        .select(columns)
        .eq("publication_status", "approved")
        .eq("ticker_eligible", true)
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limit);
}

async function fetchLatestAnnouncements(client, limit = RECORD_LIMIT, now = Date.now()) {
    let result = await runAnnouncementQuery(client, FULL_COLUMNS, limit);
    if (result.error && result.error.code === "42703") {
        result = await runAnnouncementQuery(client, BASE_COLUMNS, limit);
    }
    if (result.error) throw result.error;
    return normalizeSupabaseRows(result.data, now);
}

async function fetchCanonicalFallback(fetchImpl = fetch, now = Date.now()) {
    const response = await fetchImpl(DATA_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Canonical announcements returned HTTP ${response.status}`);
    return normalizeCanonicalRows(await response.json(), now);
}

function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
}

function createDialog() {
    const overlay = createElement("div", "supabase-ticker-dialog");
    overlay.hidden = true;
    const panel = createElement("section", "supabase-ticker-dialog__panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "supabase-ticker-dialog-title");
    const close = createElement("button", "supabase-ticker-dialog__close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "Close announcement summary");
    const label = createElement("p", "supabase-ticker-dialog__label", "GLOBAL ANNOUNCEMENT");
    const title = createElement("h2", "supabase-ticker-dialog__title");
    title.id = "supabase-ticker-dialog-title";
    const meta = createElement("p", "supabase-ticker-dialog__meta");
    const summary = createElement("p", "supabase-ticker-dialog__summary");
    const actions = createElement("div", "supabase-ticker-dialog__actions");
    const detail = createElement("a", "supabase-ticker-dialog__secondary", "Open GPIR record →");
    const source = createElement("a", "supabase-ticker-dialog__source", "Read original source →");
    detail.target = "_self";
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    actions.append(detail, source);
    panel.append(close, label, title, meta, summary, actions);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    let previousFocus = null;
    let previousOverflow = "";

    function closeDialog() {
        if (overlay.hidden) return;
        overlay.hidden = true;
        document.body.style.overflow = previousOverflow;
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
    }

    function openDialog(record, trigger) {
        previousFocus = trigger;
        previousOverflow = document.body.style.overflow;
        title.textContent = record.title;
        meta.textContent = `${record.timeLabel} · ${record.sourceLabel} · ${record.lifecycle}`;
        summary.textContent = record.summary || "A summary is not available for this approved announcement.";
        detail.hidden = !record.detailUrl;
        if (record.detailUrl) detail.href = record.detailUrl;
        source.hidden = !record.sourceUrl;
        if (record.sourceUrl) source.href = record.sourceUrl;
        overlay.hidden = false;
        document.body.style.overflow = "hidden";
        close.focus();
    }

    close.addEventListener("click", closeDialog);
    overlay.addEventListener("click", event => {
        if (event.target === overlay) closeDialog();
    });
    document.addEventListener("keydown", event => {
        if (!overlay.hidden && event.key === "Escape") closeDialog();
    });

    return { openDialog };
}

function buildSequence(records, dialog, duplicate = false) {
    const sequence = createElement("span", "supabase-ticker-sequence");
    if (duplicate) sequence.setAttribute("aria-hidden", "true");
    records.forEach(record => {
        const button = createElement("button", "supabase-ticker-item");
        button.type = "button";
        if (duplicate) button.tabIndex = -1;
        const lifecycle = createElement("span", `supabase-ticker-status supabase-ticker-status--${record.lifecycle.toLowerCase()}`, record.lifecycle);
        const time = createElement("time", "supabase-ticker-time", record.timeLabel);
        if (record.publishedAt) time.dateTime = record.publishedAt;
        const source = createElement("span", "supabase-ticker-source", record.sourceLabel);
        const headline = createElement("span", "supabase-ticker-headline", record.title);
        button.append(lifecycle, time, source, headline);
        button.addEventListener("click", () => dialog.openDialog(record, button));
        sequence.appendChild(button);
    });
    return sequence;
}

function renderStatus(track, message) {
    track.className = "ticker-track supabase-ticker-track supabase-ticker-track--status";
    track.replaceChildren(createElement("a", "supabase-ticker-message", message));
    track.firstElementChild.href = ARCHIVE_URL;
}

function renderTicker(track, ribbon, records, dialog, source) {
    if (!records.length) {
        renderStatus(track, "No approved announcements available · View archive →");
        return;
    }
    ribbon.classList.add("supabase-ticker-active");
    track.className = "ticker-track supabase-ticker-track";
    track.dataset.source = source;
    track.setAttribute("aria-label", `${records.length} global announcements`);
    const primary = buildSequence(records, dialog);
    const duplicate = buildSequence(records, dialog, true);
    track.replaceChildren(primary, duplicate);

    const measure = () => {
        const distance = primary.getBoundingClientRect().width;
        if (!distance) return;
        track.style.setProperty("--supabase-ticker-distance", `${distance}px`);
        track.style.setProperty("--supabase-ticker-duration", `${Math.max(32, distance / 48)}s`);
    };
    requestAnimationFrame(measure);
    if ("ResizeObserver" in window) new ResizeObserver(measure).observe(primary);
}

async function initialize() {
    const track = document.getElementById("announcementTicker");
    const ribbon = document.getElementById("market-ribbon");
    if (!track || !ribbon) return;
    const dialog = createDialog();
    renderStatus(track, "Loading current announcements…");

    try {
        const client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
        });
        const records = await fetchLatestAnnouncements(client);
        if (records.length) {
            renderTicker(track, ribbon, records, dialog, "supabase");
            return;
        }
        throw new Error("Supabase returned no publicly readable approved announcements");
    } catch (error) {
        console.warn("[GPIR] Supabase ticker unavailable; retaining canonical fallback:", error);
    }

    try {
        const records = await fetchCanonicalFallback();
        renderTicker(track, ribbon, records, dialog, "canonical-fallback");
    } catch (error) {
        console.error("[GPIR] Announcement fallback unavailable:", error);
        renderStatus(track, "Announcements temporarily unavailable · View archive →");
    }
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initialize, { once: true });
    } else {
        initialize();
    }
}

export {
    fetchCanonicalFallback,
    fetchLatestAnnouncements,
    formatUtcTime,
    lifecycleFor,
    normalizeCanonicalRows,
    normalizeSupabaseRows,
    safeSourceUrl
};

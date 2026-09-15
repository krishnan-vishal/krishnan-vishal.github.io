import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_YOUR_KEY";

const TABLE_NAME = "global_announcements";
const MAX_ANNOUNCEMENTS = 20;
const FALLBACK_URL = "pages/intelligence/index.html";

function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
}

function validSourceUrl(value) {
    try {
        const url = new URL(String(value || ""));
        return url.protocol === "https:" ? url.href : null;
    } catch {
        return null;
    }
}

function formatPublishedAt(value) {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) {
        return "";
    }

    return new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC"
    }).format(date) + " UTC";
}

function installTickerStyles() {
    if (document.getElementById("gpir-live-ticker-styles")) return;

    const style = document.createElement("style");
    style.id = "gpir-live-ticker-styles";
    style.textContent = `
        #market-ribbon.gpir-live-ribbon {
            min-height: 42px;
            background: #07111f;
            border-top: 1px solid #f6b817;
            border-bottom: 1px solid #f6b817;
            color: #ffffff;
        }

        #market-ribbon.gpir-live-ribbon .market-title {
            align-self: stretch;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 14px;
            background: #f6b817;
            color: #07111f;
            font-size: 11px;
            font-weight: 900;
            letter-spacing: 0.08em;
            white-space: nowrap;
        }

        #market-ribbon.gpir-live-ribbon .ticker-wrapper {
            min-width: 0;
            height: 42px;
            overflow: hidden;
            background: #07111f;
        }

        #market-ribbon #announcementTicker.gpir-live-track {
            display: flex;
            align-items: stretch;
            width: max-content;
            max-width: none;
            height: 42px;
            padding: 0;
            animation:
                gpirLiveTickerScroll
                var(--gpir-live-duration, 80s)
                linear
                infinite !important;
            will-change: transform;
        }

        #market-ribbon #announcementTicker.gpir-live-track:hover,
        #market-ribbon #announcementTicker.gpir-live-track:focus-within {
            animation-play-state: paused !important;
        }

        .gpir-live-sequence {
            display: flex;
            flex: none;
            align-items: stretch;
            min-width: 100vw;
        }

        .gpir-live-headline {
            appearance: none;
            display: inline-flex;
            align-items: center;
            gap: 10px;
            min-height: 42px;
            margin: 0;
            padding: 0 18px;
            border: 0;
            border-right: 1px solid rgba(246, 184, 23, 0.28);
            background: transparent;
            color: #ffd35a;
            font: inherit;
            font-size: 13px;
            font-weight: 750;
            line-height: 1.25;
            white-space: nowrap;
            cursor: pointer;
        }

        .gpir-live-headline:hover {
            background: rgba(246, 184, 23, 0.13);
            color: #ffffff;
        }

        .gpir-live-headline:focus-visible {
            position: relative;
            z-index: 2;
            outline: 2px solid #ffffff;
            outline-offset: -3px;
        }

        .gpir-live-date {
            color: #c6d2e1;
            font-size: 10px;
            font-weight: 650;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .gpir-live-marker {
            color: #f6b817;
            font-size: 9px;
        }

        .gpir-ticker-fallback {
            display: flex;
            align-items: center;
            min-height: 42px;
            padding: 0 18px;
            color: #ffd35a;
            font-size: 13px;
            font-weight: 700;
            text-decoration: none;
        }

        .gpir-modal-overlay {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: grid;
            place-items: center;
            padding: 20px;
            background: rgba(1, 8, 17, 0.82);
            backdrop-filter: blur(5px);
        }

        .gpir-modal-overlay[hidden] {
            display: none;
        }

        .gpir-summary-modal {
            position: relative;
            width: min(620px, 100%);
            max-height: min(720px, calc(100vh - 40px));
            overflow-y: auto;
            padding: 30px;
            border: 1px solid rgba(246, 184, 23, 0.65);
            border-radius: 14px;
            background: #0b1727;
            color: #f7f9fc;
            box-shadow: 0 28px 80px rgba(0, 0, 0, 0.55);
        }

        .gpir-summary-label {
            margin: 0 42px 10px 0;
            color: #f6b817;
            font-size: 11px;
            font-weight: 850;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        .gpir-summary-title {
            margin: 0 42px 10px 0;
            color: #ffd35a;
            font-size: clamp(20px, 4vw, 29px);
            line-height: 1.25;
        }

        .gpir-summary-date {
            margin: 0 0 20px;
            color: #aebed1;
            font-size: 12px;
        }

        .gpir-summary-text {
            margin: 0 0 26px;
            color: #edf3fa;
            font-size: 15px;
            line-height: 1.7;
            white-space: pre-line;
        }

        .gpir-summary-close {
            position: absolute;
            top: 15px;
            right: 15px;
            width: 36px;
            height: 36px;
            border: 1px solid #53657a;
            border-radius: 50%;
            background: transparent;
            color: #ffffff;
            font-size: 23px;
            line-height: 1;
            cursor: pointer;
        }

        .gpir-summary-close:hover,
        .gpir-summary-close:focus-visible {
            border-color: #f6b817;
            color: #f6b817;
        }

        .gpir-source-button {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 42px;
            padding: 0 18px;
            border-radius: 7px;
            background: #f6b817;
            color: #07111f;
            font-size: 13px;
            font-weight: 850;
            text-decoration: none;
        }

        .gpir-source-button:hover,
        .gpir-source-button:focus-visible {
            background: #ffd35a;
            color: #07111f;
        }

        @keyframes gpirLiveTickerScroll {
            from {
                transform: translate3d(0, 0, 0);
            }

            to {
                transform: translate3d(
                    calc(-1 * var(--gpir-live-distance, 50%)),
                    0,
                    0
                );
            }
        }

        @media (prefers-reduced-motion: reduce) {
            #market-ribbon #announcementTicker.gpir-live-track {
                width: 100%;
                overflow-x: auto;
                animation: none !important;
                scrollbar-width: thin;
            }

            #market-ribbon
                #announcementTicker.gpir-live-track
                .gpir-live-sequence[aria-hidden="true"] {
                display: none;
            }
        }

        @media (max-width: 720px) {
            #market-ribbon.gpir-live-ribbon .market-title {
                padding: 0 8px;
                font-size: 9px;
            }

            .gpir-live-headline {
                padding: 0 12px;
                font-size: 12px;
            }

            .gpir-live-date {
                display: none;
            }

            .gpir-summary-modal {
                padding: 24px 20px;
            }
        }
    `;

    document.head.appendChild(style);
}

function createSummaryModal() {
    const overlay = document.createElement("div");
    overlay.className = "gpir-modal-overlay";
    overlay.hidden = true;

    const modal = document.createElement("section");
    modal.className = "gpir-summary-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "gpir-summary-title");

    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.className = "gpir-summary-close";
    closeButton.setAttribute("aria-label", "Close announcement summary");
    closeButton.textContent = "×";

    const label = document.createElement("p");
    label.className = "gpir-summary-label";
    label.textContent = "Global announcement";

    const title = document.createElement("h2");
    title.id = "gpir-summary-title";
    title.className = "gpir-summary-title";

    const date = document.createElement("p");
    date.className = "gpir-summary-date";

    const summary = document.createElement("p");
    summary.className = "gpir-summary-text";

    const sourceButton = document.createElement("a");
    sourceButton.className = "gpir-source-button";
    sourceButton.target = "_blank";
    sourceButton.rel = "noopener noreferrer";
    sourceButton.textContent = "Read Original Source →";

    modal.append(
        closeButton,
        label,
        title,
        date,
        summary,
        sourceButton
    );

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    let previouslyFocused = null;
    let previousBodyOverflow = "";

    function closeModal() {
        if (overlay.hidden) return;

        overlay.hidden = true;
        previousBodyOverflow = previousBodyOverflow || "";
        document.body.style.overflow = previousBodyOverflow;

        if (previouslyFocused instanceof HTMLElement) {
            previouslyFocused.focus();
        }
    }

    function openModal(record, trigger) {
        previouslyFocused = trigger;
        previousBodyOverflow = document.body.style.overflow;

        title.textContent = record.title;
        date.textContent = formatPublishedAt(record.published_at);
        date.hidden = !date.textContent;

        summary.textContent = record.summary_narration ||
            "A summary is not currently available for this announcement.";

        if (record.sourceUrl) {
            sourceButton.href = record.sourceUrl;
            sourceButton.hidden = false;
        } else {
            sourceButton.removeAttribute("href");
            sourceButton.hidden = true;
        }

        overlay.hidden = false;
        document.body.style.overflow = "hidden";
        closeButton.focus();
    }

    closeButton.addEventListener("click", closeModal);

    overlay.addEventListener("click", event => {
        if (event.target === overlay) closeModal();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !overlay.hidden) {
            closeModal();
        }
    });

    return { openModal };
}

function buildTickerSequence(records, modal, isDuplicate = false) {
    const sequence = document.createElement("div");
    sequence.className = "gpir-live-sequence";

    if (isDuplicate) {
        sequence.setAttribute("aria-hidden", "true");
    }

    records.forEach(record => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "gpir-live-headline";

        if (isDuplicate) {
            button.tabIndex = -1;
        }

        const marker = document.createElement("span");
        marker.className = "gpir-live-marker";
        marker.setAttribute("aria-hidden", "true");
        marker.textContent = "◆";

        const headline = document.createElement("span");
        headline.textContent = record.title;

        const date = document.createElement("time");
        date.className = "gpir-live-date";
        date.dateTime = record.published_at || "";
        date.textContent = formatPublishedAt(record.published_at);

        button.append(marker, headline);

        if (date.textContent) {
            button.appendChild(date);
        }

        button.addEventListener("click", () => {
            modal.openModal(record, button);
        });

        sequence.appendChild(button);
    });

    return sequence;
}

function renderFallback(ticker, message) {
    ticker.classList.remove("gpir-live-track");
    ticker.replaceChildren();

    const fallback = document.createElement("a");
    fallback.className = "gpir-ticker-fallback";
    fallback.href = FALLBACK_URL;
    fallback.textContent = `${message} · View announcement archive →`;

    ticker.appendChild(fallback);
}

function renderTicker(ticker, records, modal) {
    ticker.replaceChildren();
    ticker.classList.add("gpir-live-track");

    const primarySequence = buildTickerSequence(records, modal);
    const duplicateSequence = buildTickerSequence(records, modal, true);

    ticker.append(primarySequence, duplicateSequence);

    const measureTicker = () => {
        const distance = primarySequence.getBoundingClientRect().width;

        if (!distance) return;

        ticker.style.setProperty(
            "--gpir-live-distance",
            `${distance}px`
        );

        ticker.style.setProperty(
            "--gpir-live-duration",
            `${Math.max(40, distance / 55)}s`
        );
    };

    requestAnimationFrame(measureTicker);

    if ("ResizeObserver" in window) {
        const observer = new ResizeObserver(measureTicker);
        observer.observe(primarySequence);
    }
}

async function loadAnnouncements(client) {
    const { data, error } = await client
        .from(TABLE_NAME)
        .select(`
            title,
            summary_narration,
            canonical_url,
            url,
            published_at
        `)
        .eq("ticker_eligible", true)
        .eq("publication_status", "approved")
        .order("published_at", {
            ascending: false,
            nullsFirst: false
        })
        .limit(MAX_ANNOUNCEMENTS);

    if (error) throw error;

    return (data || [])
        .map(record => ({
            title: cleanText(record.title),
            summary_narration: cleanText(record.summary_narration),
            published_at: record.published_at,
            sourceUrl: validSourceUrl(
                record.canonical_url || record.url
            )
        }))
        .filter(record => record.title);
}

async function initializeSupabaseTicker() {
    const ticker = document.getElementById("announcementTicker");

    if (!ticker) return;

    const ribbon = ticker.closest("#market-ribbon");

    if (ribbon) {
        ribbon.classList.add("gpir-live-ribbon");
    }

    installTickerStyles();

    const modal = createSummaryModal();

    renderFallback(ticker, "Loading latest announcements");

    const client = createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY,
        {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        }
    );

    try {
        const records = await loadAnnouncements(client);

        if (!records.length) {
            renderFallback(ticker, "No approved announcements available");
            return;
        }

        renderTicker(ticker, records, modal);
    } catch (error) {
        console.error("[GPIR] Supabase ticker query failed:", error);
        renderFallback(ticker, "Live announcements temporarily unavailable");
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeSupabaseTicker,
        { once: true }
    );
} else {
    initializeSupabaseTicker();
}

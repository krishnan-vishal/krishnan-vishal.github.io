import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://qlnvhfapctcpzqyuhhth.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsbnZoZmFwY3RjcHpxeXVoaHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTA1NjYsImV4cCI6MjEwNDg2NjU2Nn0.5V_Oe-J4FtPWsUS3R8n9R2u5T-mzUoaIN3O6PCPpHAI";

const TABLE_NAME = "global_announcements";
const PAGE_SIZE = 1000;
const LIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
];

const FILTER_FIELDS = [
    "region",
    "country",
    "category",
    "subcategory"
];

function cleanText(value) {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim();
}

function approvedSourceUrl(record) {
    const candidates = [
        record.canonical_url,
        record.url,
        record.source_url
    ];

    for (const candidate of candidates) {
        if (!candidate) continue;

        try {
            const url = new URL(candidate);

            if (
                url.protocol === "https:" &&
                !url.username &&
                !url.password
            ) {
                return url.href;
            }
        } catch {
            // Try the next available source field.
        }
    }

    return null;
}

function parseArchivePeriod(archiveMonthYear, publishedAt) {
    const value = cleanText(archiveMonthYear);
    const match = value.match(/^(0[1-9]|1[0-2])\/(\d{4})$/);

    if (match) {
        const month = match[1];
        const year = match[2];

        return {
            year,
            month,
            key: `${year}-${month}`,
            label: `${MONTH_NAMES[Number(month) - 1]} ${year}`
        };
    }

    const publishedDate = new Date(publishedAt);

    if (!Number.isNaN(publishedDate.getTime())) {
        const year = String(publishedDate.getUTCFullYear());
        const month = String(
            publishedDate.getUTCMonth() + 1
        ).padStart(2, "0");

        return {
            year,
            month,
            key: `${year}-${month}`,
            label: `${MONTH_NAMES[Number(month) - 1]} ${year}`
        };
    }

    return {
        year: "Undated",
        month: "",
        key: "Undated",
        label: "Undated"
    };
}

function formatUtcDate(value) {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) {
        return "UTC DATE UNAVAILABLE";
    }

    return new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "UTC"
    }).format(date).toUpperCase() + " UTC";
}

function isWithinLiveWindow(record, now = Date.now()) {
    const timestamp = Date.parse(record.publishedAt);

    if (!Number.isFinite(timestamp)) return false;

    const age = now - timestamp;

    return age >= 0 && age <= LIVE_WINDOW_MS;
}

function normalizeRecord(record) {
    const title = cleanText(record.title);

    if (!title) return null;

    const publishedAt = cleanText(record.published_at);
    const period = parseArchivePeriod(
        record.archive_month_year,
        publishedAt
    );

    return {
        title,
        narration: cleanText(record.summary_narration) ||
            "No narration has been supplied for this approved record.",
        region: cleanText(record.region) || "Unspecified",
        country: cleanText(record.country) || "Unspecified",
        category: cleanText(record.category) || "Uncategorized",
        subcategory: cleanText(record.subcategory) || "Unspecified",
        publishedAt,
        period,
        sourceUrl: approvedSourceUrl(record)
    };
}

function createElement(tagName, className, text) {
    const element = document.createElement(tagName);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function installArchiveStyles() {
    if (document.getElementById("supabase-archive-styles")) return;

    const style = document.createElement("style");
    style.id = "supabase-archive-styles";
    style.textContent = `
        [data-announcement-dashboard].supabase-archive {
            --archive-bg: #07111f;
            --archive-surface: #0c1a2b;
            --archive-surface-hover: #10233a;
            --archive-border: #314359;
            --archive-amber: #f6b817;
            --archive-amber-bright: #ffd35a;
            --archive-text: #f4f7fb;
            --archive-muted: #aebed1;
            --archive-success: #6ee7b7;
        }

        .supabase-archive .announcement-dashboard-heading {
            padding: 20px;
            border: 1px solid var(--archive-border);
            border-radius: 12px;
            background: var(--archive-bg);
            color: var(--archive-text);
        }

        .supabase-archive .announcement-dashboard-heading h2 {
            color: var(--archive-amber-bright);
        }

        .supabase-archive [data-counts] {
            color: var(--archive-success);
        }

        .supabase-archive .announcement-period-nav {
            display: grid;
            gap: 10px;
            margin: 24px 0 18px;
            padding: 15px;
            border: 1px solid var(--archive-border);
            border-radius: 12px;
            background: var(--archive-bg);
        }

        .supabase-archive .announcement-period-years,
        .supabase-archive .announcement-period-months {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        .supabase-archive .announcement-period-nav button {
            min-height: 36px;
            padding: 7px 12px;
            border: 1px solid #43566d;
            border-radius: 7px;
            background: #102033;
            color: #dce7f3;
            font: inherit;
            font-size: 12px;
            font-weight: 750;
            cursor: pointer;
        }

        .supabase-archive .announcement-period-nav button:hover {
            border-color: var(--archive-amber);
            color: var(--archive-amber-bright);
        }

        .supabase-archive
            .announcement-period-nav
            button[aria-pressed="true"] {
            border-color: var(--archive-amber);
            background: var(--archive-amber);
            color: #07111f;
        }

        .supabase-archive .announcement-period-nav button span {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 21px;
            min-height: 21px;
            margin-left: 5px;
            padding: 0 5px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.16);
            font-size: 10px;
        }

        .supabase-archive .announcement-dashboard-filters {
            display: grid;
            grid-template-columns: repeat(4, minmax(140px, 1fr)) auto;
            gap: 12px;
            align-items: end;
            margin-bottom: 24px;
            padding: 16px;
            border: 1px solid var(--archive-border);
            border-radius: 12px;
            background: var(--archive-bg);
        }

        .supabase-archive .announcement-dashboard-filters label {
            display: grid;
            gap: 6px;
            color: var(--archive-muted);
            font-size: 11px;
            font-weight: 750;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }

        .supabase-archive .announcement-dashboard-filters select {
            width: 100%;
            min-height: 40px;
            padding: 8px 32px 8px 10px;
            border: 1px solid #43566d;
            border-radius: 7px;
            background: #102033;
            color: var(--archive-text);
            font: inherit;
            font-size: 13px;
        }

        .supabase-archive .announcement-dashboard-filters select:focus {
            border-color: var(--archive-amber);
            outline: 2px solid rgba(246, 184, 23, 0.3);
            outline-offset: 1px;
        }

        .supabase-archive [data-reset] {
            min-height: 40px;
            padding: 8px 15px;
            border: 1px solid var(--archive-amber);
            border-radius: 7px;
            background: transparent;
            color: var(--archive-amber-bright);
            font: inherit;
            font-size: 12px;
            font-weight: 800;
            cursor: pointer;
        }

        .supabase-archive [data-reset]:hover {
            background: var(--archive-amber);
            color: #07111f;
        }

        .supabase-archive .announcement-dashboard-results {
            color: var(--archive-text);
        }

        .supabase-archive [data-results-count] {
            color: var(--archive-amber-bright);
        }

        .supabase-archive .announcement-dashboard-grid {
            display: grid;
            grid-template-columns: repeat(
                auto-fit,
                minmax(min(100%, 310px), 1fr)
            );
            gap: 16px;
        }

        .supabase-archive .supabase-announcement-card {
            position: relative;
            display: flex;
            flex-direction: column;
            min-height: 280px;
            padding: 20px;
            overflow: hidden;
            border: 1px solid var(--archive-border);
            border-radius: 12px;
            background:
                linear-gradient(
                    145deg,
                    var(--archive-surface),
                    var(--archive-bg)
                );
            color: var(--archive-text);
            box-shadow: 0 14px 36px rgba(0, 0, 0, 0.2);
        }

        .supabase-archive .supabase-announcement-card::before {
            content: "";
            position: absolute;
            inset: 0 auto 0 0;
            width: 3px;
            background: var(--archive-amber);
        }

        .supabase-archive .supabase-announcement-card:hover {
            border-color: rgba(246, 184, 23, 0.7);
            background:
                linear-gradient(
                    145deg,
                    var(--archive-surface-hover),
                    var(--archive-bg)
                );
            transform: translateY(-2px);
        }

        .supabase-archive-card-topline {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            margin-bottom: 15px;
        }

        .supabase-archive-category {
            display: inline-flex;
            align-items: center;
            min-height: 25px;
            padding: 4px 9px;
            border: 1px solid rgba(246, 184, 23, 0.65);
            border-radius: 999px;
            background: rgba(246, 184, 23, 0.11);
            color: var(--archive-amber-bright);
            font-size: 10px;
            font-weight: 850;
            letter-spacing: 0.05em;
            text-transform: uppercase;
        }

        .supabase-archive-date {
            color: var(--archive-muted);
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.04em;
        }

        .supabase-archive-title {
            margin: 0 0 13px;
            color: var(--archive-amber-bright);
            font-size: 19px;
            line-height: 1.35;
        }

        .supabase-archive-narration {
            display: -webkit-box;
            margin: 0 0 18px;
            overflow: hidden;
            color: #e5edf6;
            font-size: 13px;
            line-height: 1.65;
            -webkit-box-orient: vertical;
            -webkit-line-clamp: 5;
        }

        .supabase-archive-metadata {
            display: flex;
            flex-wrap: wrap;
            gap: 7px 13px;
            margin-top: auto;
            padding-top: 15px;
            border-top: 1px solid rgba(174, 190, 209, 0.18);
            color: var(--archive-muted);
            font-size: 11px;
        }

        .supabase-archive-subcategory {
            width: 100%;
            color: #cdd9e6;
        }

        .supabase-archive-source {
            display: inline-flex;
            align-items: center;
            align-self: flex-start;
            min-height: 38px;
            margin-top: 16px;
            padding: 7px 13px;
            border-radius: 7px;
            background: var(--archive-amber);
            color: #07111f;
            font-size: 12px;
            font-weight: 850;
            text-decoration: none;
        }

        .supabase-archive-source:hover,
        .supabase-archive-source:focus-visible {
            background: var(--archive-amber-bright);
            color: #07111f;
        }

        .supabase-archive-source-unavailable {
            margin-top: 16px;
            color: var(--archive-muted);
            font-size: 11px;
            font-weight: 700;
        }

        .supabase-archive-message {
            grid-column: 1 / -1;
            padding: 28px;
            border: 1px dashed var(--archive-border);
            border-radius: 10px;
            background: var(--archive-bg);
            color: var(--archive-muted);
            text-align: center;
        }

        @media (max-width: 980px) {
            .supabase-archive .announcement-dashboard-filters {
                grid-template-columns: repeat(2, minmax(140px, 1fr));
            }
        }

        @media (max-width: 600px) {
            .supabase-archive .announcement-dashboard-filters {
                grid-template-columns: 1fr;
            }

            .supabase-archive .announcement-dashboard-grid {
                grid-template-columns: 1fr;
            }

            .supabase-archive .supabase-announcement-card {
                min-height: 0;
            }
        }
    `;

    document.head.appendChild(style);
}

function buildPeriods(records) {
    const yearMap = new Map();

    for (const record of records) {
        const { year, month } = record.period;

        if (!yearMap.has(year)) {
            yearMap.set(year, new Map());
        }

        const monthMap = yearMap.get(year);
        monthMap.set(month, (monthMap.get(month) || 0) + 1);
    }

    return [...yearMap.entries()]
        .sort(([leftYear], [rightYear]) => {
            if (leftYear === "Undated") return 1;
            if (rightYear === "Undated") return -1;
            return Number(rightYear) - Number(leftYear);
        })
        .map(([year, monthMap]) => ({
            year,
            count: [...monthMap.values()]
                .reduce((total, count) => total + count, 0),
            months: [...monthMap.entries()]
                .sort(([leftMonth], [rightMonth]) =>
                    rightMonth.localeCompare(leftMonth)
                )
                .map(([month, count]) => ({
                    month,
                    count,
                    label: month
                        ? MONTH_NAMES[Number(month) - 1]
                        : "Undated"
                }))
        }));
}

function populateDropdown(select, records, field) {
    if (!select) return;

    const values = [...new Set(
        records.map(record => record[field]).filter(Boolean)
    )].sort((left, right) =>
        left.localeCompare(right, undefined, {
            sensitivity: "base"
        })
    );

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All";

    select.replaceChildren(allOption);

    for (const value of values) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
    }
}

function createTimelineButton({
    label,
    count,
    value,
    attribute,
    pressed,
    onClick
}) {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute(attribute, value);
    button.setAttribute("aria-pressed", String(pressed));
    button.append(document.createTextNode(label));

    const countBadge = document.createElement("span");
    countBadge.textContent = String(count);
    button.appendChild(countBadge);

    button.addEventListener("click", onClick);

    return button;
}

function createAnnouncementCard(record) {
    const article = createElement(
        "article",
        "announcement-dashboard-card supabase-announcement-card"
    );

    article.dataset.period = record.period.key;
    article.dataset.region = record.region;
    article.dataset.country = record.country;
    article.dataset.category = record.category;
    article.dataset.subcategory = record.subcategory;

    const topLine = createElement(
        "div",
        "supabase-archive-card-topline"
    );

    const category = createElement(
        "span",
        "supabase-archive-category",
        record.category
    );

    const publishedTime = createElement(
        "time",
        "supabase-archive-date",
        formatUtcDate(record.publishedAt)
    );

    if (record.publishedAt) {
        publishedTime.dateTime = record.publishedAt;
    }

    topLine.append(category, publishedTime);

    const title = createElement(
        "h3",
        "supabase-archive-title",
        record.title
    );

    const narration = createElement(
        "p",
        "supabase-archive-narration",
        record.narration
    );

    const metadata = createElement(
        "div",
        "supabase-archive-metadata"
    );

    const region = createElement(
        "span",
        "",
        `Region: ${record.region}`
    );

    const country = createElement(
        "span",
        "",
        `Country: ${record.country}`
    );

    const subcategory = createElement(
        "span",
        "supabase-archive-subcategory",
        `Subcategory: ${record.subcategory}`
    );

    metadata.append(region, country, subcategory);
    article.append(topLine, title, narration, metadata);

    if (record.sourceUrl) {
        const sourceLink = createElement(
            "a",
            "supabase-archive-source",
            "Open Original Source →"
        );

        sourceLink.href = record.sourceUrl;
        sourceLink.target = "_blank";
        sourceLink.rel = "noopener noreferrer";

        article.appendChild(sourceLink);
    } else {
        article.appendChild(createElement(
            "span",
            "supabase-archive-source-unavailable",
            "Verified source URL unavailable"
        ));
    }

    return article;
}

function renderGrid(container, records, emptyMessage) {
    if (!container) return;

    if (!records.length) {
        container.replaceChildren(createElement(
            "p",
            "supabase-archive-message",
            emptyMessage
        ));
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const record of records) {
        fragment.appendChild(createAnnouncementCard(record));
    }

    container.replaceChildren(fragment);
}

async function fetchAllApprovedAnnouncements(client) {
    const records = [];
    let start = 0;

    while (true) {
        const end = start + PAGE_SIZE - 1;

        const { data, error } = await client
            .from(TABLE_NAME)
            .select(`
                title,
                region,
                country,
                category,
                subcategory,
                summary_narration,
                published_at,
                archive_month_year,
                canonical_url,
                url
            `)
            .eq("publication_status", "approved")
            .eq("ticker_eligible", true)
            .order("published_at", {
                ascending: false,
                nullsFirst: false
            })
            .range(start, end);

        if (error) throw error;

        const page = data || [];
        records.push(...page);

        if (page.length < PAGE_SIZE) break;

        start += PAGE_SIZE;
    }

    return records
        .map(normalizeRecord)
        .filter(Boolean);
}

function initializeArchiveInterface(root, records) {
    const yearOptions = root.querySelector("[data-year-options]");
    const monthOptions = root.querySelector("[data-month-options]");
    const archiveGrid = root.querySelector("[data-archive]");
    const liveGrid = root.querySelector("[data-live]");
    const resultsCount = root.querySelector("[data-results-count]");
    const archiveStatus = root.querySelector("[data-counts]");
    const resetButton = root.querySelector("[data-reset]");
    const periods = buildPeriods(records);

    const controls = {};

    for (const field of FILTER_FIELDS) {
        controls[field] = root.querySelector(
            `[data-filter="${field}"]`
        );

        populateDropdown(controls[field], records, field);
    }

    let activeYear = periods.length ? periods[0].year : "";
    let activeMonth = "";

    function filteredRecords() {
        return records.filter(record => {
            if (
                activeYear &&
                record.period.year !== activeYear
            ) {
                return false;
            }

            if (
                activeMonth &&
                record.period.month !== activeMonth
            ) {
                return false;
            }

            return FILTER_FIELDS.every(field => {
                const selectedValue = controls[field]
                    ? controls[field].value
                    : "";

                return (
                    !selectedValue ||
                    record[field] === selectedValue
                );
            });
        });
    }

    function renderTimeline() {
        if (yearOptions) {
            const yearFragment = document.createDocumentFragment();

            yearFragment.appendChild(createTimelineButton({
                label: "All years",
                count: records.length,
                value: "",
                attribute: "data-year",
                pressed: activeYear === "",
                onClick() {
                    activeYear = "";
                    activeMonth = "";
                    render();
                }
            }));

            for (const period of periods) {
                yearFragment.appendChild(createTimelineButton({
                    label: period.year,
                    count: period.count,
                    value: period.year,
                    attribute: "data-year",
                    pressed: period.year === activeYear,
                    onClick() {
                        activeYear = period.year;
                        activeMonth = "";
                        render();
                    }
                }));
            }

            yearOptions.replaceChildren(yearFragment);
        }

        if (!monthOptions) return;

        const selectedYear = periods.find(
            period => period.year === activeYear
        );

        if (!selectedYear) {
            monthOptions.replaceChildren();
            return;
        }

        const monthFragment = document.createDocumentFragment();

        monthFragment.appendChild(createTimelineButton({
            label: "All months",
            count: selectedYear.count,
            value: "",
            attribute: "data-month",
            pressed: activeMonth === "",
            onClick() {
                activeMonth = "";
                render();
            }
        }));

        for (const month of selectedYear.months) {
            monthFragment.appendChild(createTimelineButton({
                label: month.label,
                count: month.count,
                value: month.month,
                attribute: "data-month",
                pressed: month.month === activeMonth,
                onClick() {
                    activeMonth = month.month;
                    render();
                }
            }));
        }

        monthOptions.replaceChildren(monthFragment);
    }

    function render() {
        renderTimeline();

        const selected = filteredRecords();

        renderGrid(
            archiveGrid,
            selected,
            "No approved records match the selected timeline and filters."
        );

        if (resultsCount) {
            resultsCount.textContent =
                `${selected.length} record${selected.length === 1 ? "" : "s"}`;
        }
    }

    for (const field of FILTER_FIELDS) {
        if (controls[field]) {
            controls[field].addEventListener("change", render);
        }
    }

    if (resetButton) {
        resetButton.addEventListener("click", () => {
            for (const field of FILTER_FIELDS) {
                if (controls[field]) {
                    controls[field].value = "";
                }
            }

            activeYear = periods.length ? periods[0].year : "";
            activeMonth = "";
            render();
        });
    }

    const liveRecords = records.filter(record =>
        isWithinLiveWindow(record)
    );

    renderGrid(
        liveGrid,
        liveRecords,
        "No approved announcements were published in the latest 24 hours."
    );

    if (archiveStatus) {
        archiveStatus.textContent =
            `${liveRecords.length} live · ` +
            `${records.length} approved Supabase records`;

        archiveStatus.setAttribute("aria-live", "polite");
    }

    render();
}

async function initializeSupabaseArchive() {
    const root = document.querySelector(
        "[data-announcement-dashboard]"
    );

    if (!root) return;

    root.classList.add("supabase-archive");
    root.setAttribute("aria-busy", "true");

    installArchiveStyles();

    const archiveStatus = root.querySelector("[data-counts]");

    if (archiveStatus) {
        archiveStatus.textContent =
            "Loading approved announcements from Supabase…";
    }

    try {
        if (
            SUPABASE_URL.includes("YOUR_PROJECT") ||
            SUPABASE_ANON_KEY.includes("YOUR_SUPABASE")
        ) {
            throw new Error(
                "Replace the Supabase URL and anon-key placeholders"
            );
        }

        const client = createClient(
            SUPABASE_URL,
            SUPABASE_ANON_KEY,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                    detectSessionInUrl: false
                }
            }
        );

        const records = await fetchAllApprovedAnnouncements(client);

        if (!records.length) {
            throw new Error(
                "Supabase returned no approved ticker-eligible announcements"
            );
        }

        /*
         * Supabase is now authoritative for this browser session.
         * Remove the embedded JSON only after a successful response so the
         * server-rendered last-known-good archive remains visible if the
         * database or CDN is unavailable.
         */
        const embeddedStaticData = root.querySelector(
            "[data-canonical-announcements]"
        );

        if (embeddedStaticData) {
            embeddedStaticData.remove();
        }

        initializeArchiveInterface(root, records);
    } catch (error) {
        console.error(
            "[GPIR] Supabase announcement archive failed:",
            error
        );

        /*
         * Do not erase the existing server-rendered cards on failure.
         * They remain the readable last-known-good archive.
         */
        if (archiveStatus) {
            archiveStatus.textContent =
                "Live archive unavailable · showing last-known-good snapshot";
        }
    } finally {
        root.setAttribute("aria-busy", "false");
    }
}

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeSupabaseArchive,
        { once: true }
    );
} else {
    initializeSupabaseArchive();
}

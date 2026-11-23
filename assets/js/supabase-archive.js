const PUBLIC_INTELLIGENCE_API =
    "https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-public-intelligence";

const PAGE_SIZE = 1000;
const REQUEST_TIMEOUT_MS = 25000;
const LIVE_WINDOW_MS = 12 * 60 * 60 * 1000;

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
        record.canonicalUrl,
        record.source && record.source.url,
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
        month: "long",
        year: "numeric",
        ...(value.includes("T") ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } : {}),
        timeZone: "UTC"
    }).format(date) + (value.includes("T") ? " UTC" : "");
}

function isWithinLiveWindow(record, now = Date.now()) {
    const timestamp = Date.parse(record.publishedAt);

    if (!Number.isFinite(timestamp)) return false;

    const age = now - timestamp;

    return age >= 0 && age <= LIVE_WINDOW_MS;
}

function normalizeRecord(record) {
    const title = cleanText(record.title);

    if (!title || record.dataClass || record.status !== "GPIR_CLASSIFIED") return null;

    const publishedAt = cleanText(record.publishedAt || record.published_at || record.publicationDate || record.publishedDate);
    const period = parseArchivePeriod(
        record.archive_month_year || (
            record.publicationMonth && record.publicationYear
                ? `${record.publicationMonth}/${record.publicationYear}`
                : ""
        ),
        publishedAt
    );

    return {
        title,
        narration: cleanText(record.summary || record.summary_narration) ||
            "No narration has been supplied for this approved record.",
        region: cleanText(record.region) || "Unspecified",
        country: cleanText(record.country) || "Unspecified",
        category: cleanText(record.category) || "Payments",
        subcategory: cleanText(record.subcategory) || "Unspecified",
        tickerEligible: record.tickerEligible === true,
        topicIds: Array.isArray(record.topicIds)
            ? record.topicIds.map(cleanText).filter(Boolean)
            : [],
        lifecycleStatus: cleanText(
            record.displayLifecycleStatus || record.lifecycleStatus
        ) || "ARCHIVED",
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

    const selected = select.value;
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
    select.value = values.includes(selected) ? selected : "";
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
    countBadge.textContent = `(${count} ${count === 1 ? "record" : "records"})`;
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

    const actions = createElement("div", "supabase-archive-actions");

    if (record.sourceUrl) {
        const sourceLink = createElement(
            "a",
            "supabase-archive-source",
            "Open Original Source →"
        );

        sourceLink.href = record.sourceUrl;
        sourceLink.target = "_blank";
        sourceLink.rel = "noopener noreferrer";

        actions.appendChild(sourceLink);
    } else {
        actions.appendChild(createElement(
            "span",
            "supabase-archive-source-unavailable",
            "Verified source URL unavailable"
        ));
    }

    const topic = record.topicIds.length
        ? record.topicIds.join(", ")
        : record.category;
    const askQuery = [
        "Show published research and validated current and archived intelligence for",
        topic,
        record.country !== "Unspecified" ? `in ${record.country}` : "",
        record.lifecycleStatus === "ARCHIVED" ? "including this archived record" : ""
    ].filter(Boolean).join(" ");
    const askLink = createElement(
        "a",
        "supabase-archive-ask",
        "ASK GPIR about this topic"
    );
    askLink.href = `/?ask=${encodeURIComponent(askQuery)}#gpir-search`;
    actions.appendChild(askLink);
    article.appendChild(actions);

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

async function fetchPublicIntelligence() {
    const { fetchGovernedAskPage } = await import("/assets/js/gpir-governed-ask.mjs");
    const origin = new URL(PUBLIC_INTELLIGENCE_API).origin;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const records = [];
        let access;
        let total;
        do {
            const payload = await fetchGovernedAskPage(origin, { limit: String(PAGE_SIZE), offset: String(records.length) },
                (url, options) => fetch(url, { ...options, signal: controller.signal }));
            if (!Number.isInteger(payload.total) || payload.total > 50000 ||
                (total !== undefined && (total !== payload.total || access !== payload.access)) ||
                (!payload.records.length && records.length < payload.total)) {
                throw new Error("Invalid archive response");
            }
            total = payload.total;
            access = payload.access;
            records.push(...payload.records);
        } while (records.length < total);
        return { records: records.map(normalizeRecord).filter(Boolean), access };
    } finally {
        clearTimeout(timeout);
    }
}

function initializeArchiveInterface(root, records, snapshot = false) {
    const yearOptions = root.querySelector("[data-year-options]");
    const monthOptions = root.querySelector("[data-month-options]");
    const archiveGrid = root.querySelector("[data-archive]");
    const liveGrid = root.querySelector("[data-live]");
    const resultsCount = root.querySelector("[data-results-count]");
    const archiveStatus = root.querySelector("[data-counts]");
    const resetButton = root.querySelector("[data-reset]");
    const liveRecords = records.filter(record => record.tickerEligible &&
        record.lifecycleStatus === "LIVE" && isWithinLiveWindow(record));
    const liveSet = new Set(liveRecords);
    const archiveRecords = records.filter(record => !liveSet.has(record));
    const periods = buildPeriods(archiveRecords);
    const PAGE_LENGTH = 24;
    const moreButton = root.querySelector("[data-more]");
    let visible = PAGE_LENGTH;

    const controls = {};

    for (const field of FILTER_FIELDS) {
        controls[field] = root.querySelector(
            `[data-filter="${field}"]`
        );
    }

    let activeYear = "";
    let activeMonth = "";

    function matchesPeriod(record) {
        return (!activeYear || record.period.year === activeYear) &&
            (!activeMonth || record.period.month === activeMonth);
    }

    function clearDropdowns() {
        for (const select of Object.values(controls)) {
            if (select) select.value = "";
        }
    }

    function renderTimeline() {
        if (yearOptions) {
            const yearFragment = document.createDocumentFragment();

            yearFragment.appendChild(createTimelineButton({
                label: "All years",
                count: archiveRecords.length,
                value: "",
                attribute: "data-year",
                pressed: activeYear === "",
                onClick() {
                    activeYear = "";
                    activeMonth = "";
                    clearDropdowns();
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
                        clearDropdowns();
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
                clearDropdowns();
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
                    clearDropdowns();
                    render();
                }
            }));
        }

        monthOptions.replaceChildren(monthFragment);
    }

    function renderResults() {
        const inPeriod = archiveRecords.filter(matchesPeriod);
        for (const field of FILTER_FIELDS) {
            populateDropdown(controls[field], inPeriod.filter(record => FILTER_FIELDS.every(other =>
                other === field || !controls[other]?.value || record[other] === controls[other].value)), field);
        }
        const selected = inPeriod.filter(record => FILTER_FIELDS.every(field =>
            !controls[field]?.value || record[field] === controls[field].value));
        renderGrid(archiveGrid, selected.slice(0, visible),
            "No approved announcements match the timeline and filters. Use Reset filters to see all records.");
        resultsCount.textContent = `${selected.length} record${selected.length === 1 ? "" : "s"}`;
        moreButton.hidden = selected.length <= visible;
    }

    function render() {
        visible = PAGE_LENGTH;
        renderTimeline();
        renderResults();
    }

    for (const select of Object.values(controls)) {
        select?.addEventListener("change", () => {
            visible = PAGE_LENGTH;
            renderResults();
        });
    }
    moreButton.addEventListener("click", () => {
        visible += PAGE_LENGTH;
        renderResults();
    });
    resetButton?.addEventListener("click", () => {
        clearDropdowns();
        activeYear = "";
        activeMonth = "";
        render();
    });

    renderGrid(liveGrid, liveRecords, snapshot
        ? "Live announcements are temporarily unavailable."
        : "No validated announcements qualify for the latest 12 hours.");

    if (archiveStatus) {
        archiveStatus.textContent = snapshot
            ? `${archiveRecords.length} saved records · live archive unavailable`
            : `${records.length} total · ${liveRecords.length} live · ${archiveRecords.length} archived`;
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


    const archiveStatus = root.querySelector("[data-counts]");

    if (archiveStatus) {
        archiveStatus.textContent =
            "Loading approved announcements from Supabase…";
    }

    try {
        const { records, access } = await fetchPublicIntelligence();
        root.querySelector("[data-archive-preview]").hidden = access === "full";
        initializeArchiveInterface(root, records);
    } catch (error) {
        console.error("[GPIR] Supabase announcement archive failed:", error);
        const snapshot = JSON.parse(root.querySelector("[data-canonical-announcements]").textContent);
        initializeArchiveInterface(root, snapshot.records.map(normalizeRecord).filter(Boolean), true);
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

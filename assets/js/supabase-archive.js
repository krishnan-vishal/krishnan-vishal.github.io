const PUBLIC_INTELLIGENCE_API =
    "https://qlnvhfapctcpzqyuhhth.supabase.co/functions/v1/gpir-public-intelligence";

const PAGE_SIZE = 100;
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

    const publishedAt = cleanText(record.publishedAt || record.published_at);
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
    const url = new URL(PUBLIC_INTELLIGENCE_API);
    url.searchParams.set("scope", "history");
    url.searchParams.set("limit", String(PAGE_SIZE));
    url.searchParams.set("offset", "0");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
        const response = await fetch(url.href, {
            headers: { Accept: "application/json" },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`Public intelligence API returned ${response.status}`);
        const payload = await response.json();
        if (!Array.isArray(payload.records)) throw new Error("Invalid archive response");
        return payload.records.map(normalizeRecord).filter(Boolean);
    } finally {
        clearTimeout(timeout);
    }
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
        "No approved announcements were published in the latest 12 hours."
    );

    if (archiveStatus) {
        archiveStatus.textContent =
            `${liveRecords.length} live · ` +
            `${records.length} recent approved records loaded`;

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


    const archiveStatus = root.querySelector("[data-counts]");

    if (archiveStatus) {
        archiveStatus.textContent =
            "Loading approved announcements from Supabase…";
    }

    try {
        const records = await fetchPublicIntelligence();

        if (!records.length) {
            throw new Error(
                "The canonical intelligence API returned no approved records"
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

(function(root, factory){
    const api = factory();
    if(typeof module === "object" && module.exports) module.exports = api;
    if(root) root.GPIRAnnouncementArchive = api;
    if(root && root.document) api.init(root.document);
})(typeof window !== "undefined" ? window : globalThis, function(){
    "use strict";

    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const fields = ["region", "country", "category", "subcategory"];
    const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[character]);
    const valueFor = (record, field) => record[field] || (field === "subcategory" ? record.subCategory : "") || "Unspecified";
    const dateFor = record => record.publicationDate || record.publishedDate || "";

    function compactDate(record){
        const match = dateFor(record).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
        if(!match) return "DATE UNAVAILABLE";
        const month = MONTHS[Number(match[2]) - 1].slice(0, 3).toUpperCase();
        return `${match[3] ? `${Number(match[3])} ` : ""}${month} ${match[1]}`;
    }

    function periodFor(record){
        const match = dateFor(record).match(/^(\d{4})-(\d{2})/);
        return match ? { year: match[1], month: match[2], key: `${match[1]}-${match[2]}` } : { year: "Undated", month: "", key: "Undated" };
    }

    function periodCounts(records, lifecycle){
        const years = new Map();
        (records || []).filter(lifecycle.isPublished).forEach(record => {
            const period = periodFor(record);
            if(!years.has(period.year)) years.set(period.year, new Map());
            const months = years.get(period.year);
            months.set(period.month, (months.get(period.month) || 0) + 1);
        });
        return [...years.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([year, months]) => ({
            year,
            count: [...months.values()].reduce((sum, count) => sum + count, 0),
            months: [...months.entries()].sort(([left], [right]) => right.localeCompare(left)).map(([month, count]) => ({
                month,
                label: month ? MONTHS[Number(month) - 1] : "Undated",
                count
            }))
        }));
    }

    function filterRecords(records, filters, lifecycle){
        return (records || []).filter(lifecycle.isPublished).filter(record => {
            const period = periodFor(record);
            if(filters.year && period.year !== filters.year) return false;
            if(filters.month && period.month !== filters.month) return false;
            return fields.every(field => !filters[field] || valueFor(record, field) === filters[field]);
        });
    }

    function card(record){
        const source = record.sourceUrl || (record.source && record.source.url);
        const period = periodFor(record);
        const time = record.publicationTime ? String(record.publicationTime).slice(0, 5) : "TIME N/A";
        return `<article class="announcement-dashboard-card" data-period="${escapeHtml(period.key)}"><p class="announcement-card-meta-row"><time datetime="${escapeHtml(dateFor(record))}">${escapeHtml(compactDate(record))}</time><span>${escapeHtml(time)}</span><span>${escapeHtml(String(record.countryCode || valueFor(record, "country")).toUpperCase())}</span><span>${escapeHtml(valueFor(record, "category"))}</span></p><h3><a href="${escapeHtml(record.id)}.html">${escapeHtml(record.headline || record.tickerHeadline || record.title)}</a></h3><p class="announcement-card-summary">${escapeHtml(record.summary || record.whyItMatters || "")}</p><p class="announcement-card-status-row"><span class="announcement-card-status">${escapeHtml(record.validationStatus || "VALIDATED")}</span>${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Source →</a>` : ""}</p></article>`;
    }

    function init(document){
        const root = document.querySelector("[data-announcement-dashboard]");
        const lifecycle = root && globalThis.GPIRAnnouncementLifecycle;
        if(!root || !lifecycle) return;
        const embedded = root.querySelector("[data-canonical-announcements]");
        if(!embedded) return;

        let records;
        try {
            records = JSON.parse(embedded.textContent).records || [];
        } catch {
            root.querySelector("[data-counts]").textContent = "Retained archive is shown below; interactive filtering is unavailable.";
            return;
        }
        const asOf = root.getAttribute("data-as-of") || new Date().toISOString();
        const periods = periodCounts(records, lifecycle);
        let activeYear = periods.length ? periods[0].year : "";
        let activeMonth = "";

        fields.forEach(field => {
            const select = root.querySelector(`[data-filter="${field}"]`);
            if(!select) return;
            [...new Set(records.filter(lifecycle.isPublished).map(record => valueFor(record, field)).filter(Boolean))].sort().forEach(value => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            });
        });

        function renderPeriodNavigation(){
            const yearsRoot = root.querySelector("[data-year-options]");
            const monthsRoot = root.querySelector("[data-month-options]");
            yearsRoot.innerHTML = periods.map(period => `<button type="button" data-year="${escapeHtml(period.year)}" aria-pressed="${period.year === activeYear}">${escapeHtml(period.year)} <span>${period.count}</span></button>`).join("");
            const year = periods.find(period => period.year === activeYear);
            monthsRoot.innerHTML = year ? `<button type="button" data-month="" aria-pressed="${activeMonth === ""}">All months <span>${year.count}</span></button>${year.months.map(month => `<button type="button" data-month="${escapeHtml(month.month)}" aria-pressed="${month.month === activeMonth}">${escapeHtml(month.label)} <span>${month.count}</span></button>`).join("")}` : "";
            yearsRoot.querySelectorAll("[data-year]").forEach(button => button.addEventListener("click", () => {
                activeYear = button.getAttribute("data-year");
                activeMonth = "";
                render();
            }));
            monthsRoot.querySelectorAll("[data-month]").forEach(button => button.addEventListener("click", () => {
                activeMonth = button.getAttribute("data-month");
                render();
            }));
        }

        function render(){
            renderPeriodNavigation();
            const filters = { year: activeYear, month: activeMonth };
            fields.forEach(field => {
                const control = root.querySelector(`[data-filter="${field}"]`);
                filters[field] = control ? control.value : "";
            });
            const selected = filterRecords(records, filters, lifecycle).sort((left, right) => dateFor(right).localeCompare(dateFor(left)));
            const allParts = lifecycle.partition(records, asOf);
            root.querySelector("[data-counts]").textContent = `${allParts.live.length} live · ${allParts.archive.length} archived · ${allParts.developing.length} awaiting validation`;
            root.querySelector("[data-live]").innerHTML = allParts.live.length ? allParts.live.map(card).join("") : '<p class="ticker-empty">No newly validated announcements in the latest 24 hours.</p>';
            root.querySelector("[data-archive]").innerHTML = selected.length ? selected.map(card).join("") : "<p>No validated records match this Month / Year and filter selection.</p>";
            root.querySelector("[data-results-count]").textContent = `${selected.length} record${selected.length === 1 ? "" : "s"}`;
        }

        root.querySelectorAll("select").forEach(control => control.addEventListener("change", render));
        root.querySelector("[data-reset]").addEventListener("click", () => {
            root.querySelectorAll("select").forEach(control => { control.value = ""; });
            activeYear = periods.length ? periods[0].year : "";
            activeMonth = "";
            render();
        });
        render();
    }

    return { MONTHS, periodFor, periodCounts, filterRecords, init };
});

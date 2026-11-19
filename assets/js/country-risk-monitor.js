(() => {
    "use strict";

    const root = document.querySelector("[data-country-risk-monitor]");
    if (!root) return;

    const search = root.querySelector("[data-risk-search]");
    const region = root.querySelector("[data-risk-region]");
    const category = root.querySelector("[data-risk-category]");
    const summary = root.querySelector("[data-risk-summary]");
    const tbody = root.querySelector("[data-risk-rows]");
    const cards = root.querySelector("[data-risk-cards]");
    const sourceStatus = root.querySelector("[data-risk-source-status]");
    let dataset = null;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function askHref(country) {
        const query = [
            country.countryName,
            country.fatfLabel,
            "OFAC sanctions changes",
            "verified regulatory evidence"
        ].join(" ");
        return "/?ask=" + encodeURIComponent(query) + "#gpir-search";
    }

    function badgeClass(value) {
        if (value === "FATF_CALL_FOR_ACTION") return "risk-badge risk-badge--high";
        if (value === "FATF_INCREASED_MONITORING") return "risk-badge risk-badge--grey";
        return "risk-badge risk-badge--unrated";
    }

    function matches(country) {
        const term = search.value.trim().toLowerCase();
        const text = [country.countryName, country.countryCode, country.region, country.fatfLabel].join(" ").toLowerCase();
        return (!term || text.includes(term))
            && (!region.value || country.region === region.value)
            && (!category.value || country.fatfDesignation === category.value);
    }

    function renderRow(country) {
        return "<tr>" +
            "<td><strong>" + escapeHtml(country.countryName) + "</strong><small>" + escapeHtml(country.countryCode) + "</small></td>" +
            "<td>" + escapeHtml(country.region) + "</td>" +
            '<td><span class="' + badgeClass(country.fatfDesignation) + '">' + escapeHtml(country.fatfLabel) + "</span></td>" +
            '<td><span class="risk-badge risk-badge--unrated">' + escapeHtml(country.gpirAnalyticalRisk) + "</span></td>" +
            "<td>Not assessed</td>" +
            '<td><a href="#country-' + escapeHtml(country.slug) + '">Profile</a></td>' +
            "</tr>";
    }

    function renderCard(country) {
        const history = country.statusHistory.map(item =>
            "<li><time datetime=\"" + escapeHtml(item.sourcePublicationDate) + "\">" +
            escapeHtml(item.sourcePublicationDate) + "</time> — " +
            escapeHtml(country.fatfLabel) + "</li>"
        ).join("");
        return '<details class="risk-card" id="country-' + escapeHtml(country.slug) + '">' +
            "<summary><span><strong>" + escapeHtml(country.countryName) + "</strong><small>" +
            escapeHtml(country.region) + " · " + escapeHtml(country.countryCode) +
            '</small></span><span class="' + badgeClass(country.fatfDesignation) + '">' +
            escapeHtml(country.fatfLabel) + "</span></summary>" +
            '<div class="risk-card__body"><dl>' +
            "<div><dt>Official FATF designation</dt><dd>" + escapeHtml(country.fatfLabel) + "</dd></div>" +
            "<div><dt>GPIR analytical rating</dt><dd>Unrated — no approved methodology is active.</dd></div>" +
            "<div><dt>OFAC jurisdiction exposure</dt><dd>Not assessed. Entity connections do not create a country sanction.</dd></div>" +
            "<div><dt>Publication date</dt><dd>" + escapeHtml(country.publicationDate) + "</dd></div>" +
            "</dl><h3>Status evidence</h3><ul>" + history + "</ul>" +
            '<div class="risk-card__actions"><a href="' + escapeHtml(country.sourceUrl) +
            '" target="_blank" rel="noopener noreferrer">Verify FATF source</a>' +
            '<a href="' + escapeHtml(askHref(country)) + '">ASK GPIR with this country context</a></div>' +
            "</div></details>";
    }

    function render() {
        if (!dataset) return;
        const countries = dataset.countries.filter(matches);
        tbody.innerHTML = countries.map(renderRow).join("");
        cards.innerHTML = countries.map(renderCard).join("");
        summary.textContent = countries.length + " of " + dataset.countries.length +
            " currently classified jurisdictions shown · GPIR analytical ratings: 0 · OFAC jurisdiction assessments: 0";
        if (!countries.length) {
            cards.innerHTML = '<p class="risk-empty">No classified jurisdiction matches these filters. This is not evidence of a low-risk rating; unlisted jurisdictions remain unrated here.</p>';
        }
    }

    async function load() {
        try {
            const response = await fetch("../../assets/data/country-risk-monitor.json", {
                cache: "no-store",
                headers: { Accept: "application/json" }
            });
            if (!response.ok) throw new Error("HTTP_" + response.status);
            const value = await response.json();
            if (value?.schemaVersion !== "GPIR-COUNTRY-RISK-1" || !Array.isArray(value.countries)) {
                throw new Error("INVALID_DATASET");
            }
            dataset = value;
            sourceStatus.textContent = "FATF publication 30 October 2026 · retrieved 19 November 2026 · 95% publication threshold preserved";
            const regions = [...new Set(value.countries.map(item => item.region))].sort();
            region.insertAdjacentHTML("beforeend", regions.map(item =>
                '<option value="' + escapeHtml(item) + '">' + escapeHtml(item) + "</option>"
            ).join(""));
            render();
        } catch {
            sourceStatus.textContent = "Country-risk evidence is temporarily unavailable. No cached classification is being inferred.";
            summary.textContent = "Unavailable";
            cards.innerHTML = '<p class="risk-empty">The validated dataset could not be loaded. Try again later or use the official source links below.</p>';
        }
    }

    [search, region, category].forEach(control => control.addEventListener("input", render));
    void load();
})();

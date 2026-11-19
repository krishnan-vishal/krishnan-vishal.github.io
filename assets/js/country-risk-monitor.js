import { contextualAskQuery, retrieveGovernedEvidence, summarizeGovernedAsk }
    from "./gpir-governed-ask.mjs";

const root = document.querySelector("[data-country-risk-monitor]");
if (root) {
    const PAGE_SIZE = 25;
    const ALPHA3_TO_ALPHA2 = Object.freeze({
        PRK: "KP", IRN: "IR", MMR: "MM", AGO: "AO", BOL: "BO", BIH: "BA",
        CMR: "CM", HTI: "HT", IRQ: "IQ", KEN: "KE", KWT: "KW", LAO: "LA",
        LBN: "LB", NPL: "NP", PNG: "PG", SSD: "SS", SYR: "SY", VEN: "VE",
        VNM: "VN", VGB: "VG", YEM: "YE"
    });
    const search = root.querySelector("[data-risk-search]");
    const region = root.querySelector("[data-risk-region]");
    const category = root.querySelector("[data-risk-category]");
    const summary = root.querySelector("[data-risk-summary]");
    const tbody = root.querySelector("[data-risk-rows]");
    const cards = root.querySelector("[data-risk-cards]");
    const sourceStatus = root.querySelector("[data-risk-source-status]");
    const previous = root.querySelector("[data-risk-prev]");
    const next = root.querySelector("[data-risk-next]");
    const pageStatus = root.querySelector("[data-risk-page-status]");
    let dataset = null;
    let countries = [];
    let pageNumber = 1;
    let askRequest = 0;

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[character]);
    }

    function slug(value) {
        return String(value || "").toLowerCase().normalize("NFKD")
            .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    }

    function regionLabel(value) {
        return String(value || "Unclassified").toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());
    }

    function badgeClass(value) {
        if (value === "FATF_CALL_FOR_ACTION") return "risk-badge risk-badge--high";
        if (value === "FATF_INCREASED_MONITORING") return "risk-badge risk-badge--grey";
        return "risk-badge risk-badge--unrated";
    }

    function flagMarkup(country) {
        const code = String(country.countryCode2 || "").toLowerCase();
        return /^[a-z]{2}$/.test(code)
            ? '<img class="risk-flag" src="../../assets/icons/flags/' + code +
                '.svg" alt="" loading="lazy" width="24" height="18" onerror="this.hidden=true">'
            : "";
    }

    function matches(country) {
        const term = search.value.trim().toLowerCase();
        const text = [country.countryName, country.countryCode2, country.countryCode,
            country.region, country.fatfLabel].join(" ").toLowerCase();
        return (!term || text.includes(term))
            && (!region.value || country.region === region.value)
            && (!category.value || country.fatfDesignation === category.value);
    }

    function renderRow(country) {
        return "<tr>" +
            "<td><span class=\"risk-country-name\">" + flagMarkup(country) + "<span><strong>" +
            escapeHtml(country.countryName) + "</strong><small>ISO " +
            escapeHtml(country.countryCode2) + " / " + escapeHtml(country.countryCode) +
            "</small></span></span></td>" +
            "<td>" + escapeHtml(country.region) + "</td>" +
            '<td><span class="' + badgeClass(country.fatfDesignation) + '">' +
            escapeHtml(country.fatfLabel) + "</span></td>" +
            '<td><span class="risk-badge risk-badge--unrated">Unrated</span></td>' +
            "<td>Not assessed</td>" +
            '<td><a href="#country-' + escapeHtml(country.slug) + '">Profile</a></td>' +
            "</tr>";
    }

    function evidenceMarkup(country) {
        if (country.statusHistory.length) return country.statusHistory.map(item =>
            "<li><time datetime=\"" + escapeHtml(item.sourcePublicationDate) + "\">" +
            escapeHtml(item.sourcePublicationDate) + "</time> — " +
            escapeHtml(country.fatfLabel) + "</li>").join("");
        return "<li>No official FATF high-risk or increased-monitoring designation is present in the validated current snapshot. This is not a GPIR Low rating.</li>";
    }

    function renderCard(country) {
        return '<details class="risk-card" id="country-' + escapeHtml(country.slug) + '">' +
            "<summary><span class=\"risk-country-name\">" + flagMarkup(country) +
            "<span><strong>" + escapeHtml(country.countryName) + "</strong><small>" +
            escapeHtml(country.region) + " · ISO " + escapeHtml(country.countryCode2) +
            " / " + escapeHtml(country.countryCode) + '</small></span></span><span class="' +
            badgeClass(country.fatfDesignation) + '">' + escapeHtml(country.fatfLabel) +
            "</span></summary>" +
            '<div class="risk-card__body"><dl>' +
            "<div><dt>Official FATF designation</dt><dd>" + escapeHtml(country.fatfLabel) + "</dd></div>" +
            "<div><dt>GPIR analytical rating</dt><dd>Unrated — no approved methodology is active.</dd></div>" +
            "<div><dt>OFAC sanctions-program exposure</dt><dd>Not assessed. Entity connections do not create a country sanction.</dd></div>" +
            "<div><dt>Evidence date</dt><dd>" + escapeHtml(country.publicationDate || dataset.authorityState) + "</dd></div>" +
            "</dl><h3>Status evidence</h3><ul>" + evidenceMarkup(country) + "</ul>" +
            '<div class="risk-card__actions"><a href="' + escapeHtml(country.sourceUrl) +
            '" target="_blank" rel="noopener noreferrer">Verify official FATF source</a>' +
            '<a href="/intelligence-repository/?q=' + encodeURIComponent(country.countryName + " OFAC") +
            '">Search verified sanctions changes</a></div>' +
            '<form class="risk-ask" data-country-ask data-country-code="' +
            escapeHtml(country.countryCode) + '"><label>ASK GPIR about ' +
            escapeHtml(country.countryName) + '<input type="search" maxlength="120" required ' +
            'placeholder="What changed in the verified regulatory record?"></label>' +
            '<button type="submit">Ask</button><div class="risk-ask__result" data-country-ask-result aria-live="polite"></div></form>' +
            "</div></details>";
    }

    function bindAsk() {
        cards.querySelectorAll("[data-country-ask]").forEach(form => {
            form.addEventListener("submit", async event => {
                event.preventDefault();
                const request = ++askRequest;
                const country = countries.find(item => item.countryCode === form.dataset.countryCode);
                const target = form.querySelector("[data-country-ask-result]");
                const question = form.querySelector("input").value.trim().slice(0, 120);
                if (!country || !question || !target) return;
                target.replaceChildren(document.createTextNode("Searching approved regulatory intelligence…"));
                const origin = globalThis.GPIR_SUPABASE_PUBLIC_CONFIG?.url;
                try {
                    const query = contextualAskQuery(question, {
                        topic: "FATF OFAC regulatory intelligence",
                        country: country.countryName
                    });
                    const records = await retrieveGovernedEvidence(origin, query, { limit: 8 });
                    if (request !== askRequest || !form.isConnected) return;
                    const result = summarizeGovernedAsk(question, records, {
                        topic: "Regulatory intelligence",
                        country: country.countryName
                    });
                    target.replaceChildren();
                    const answer = document.createElement("p");
                    answer.textContent = result.answer;
                    target.append(answer);
                    const citations = document.createElement("ul");
                    result.citations.forEach(citation => {
                        const item = document.createElement("li");
                        if (citation.url) {
                            const link = document.createElement("a");
                            link.href = citation.url;
                            link.target = "_blank";
                            link.rel = "noopener noreferrer";
                            link.textContent = citation.title;
                            item.append(link);
                        } else item.textContent = citation.title;
                        citations.append(item);
                    });
                    if (result.citations.length) target.append(citations);
                    const official = document.createElement("a");
                    official.href = country.sourceUrl;
                    official.target = "_blank";
                    official.rel = "noopener noreferrer";
                    official.textContent = "Official FATF evidence";
                    target.append(official);
                } catch {
                    if (request !== askRequest || !form.isConnected) return;
                    target.textContent = "Verified regulatory evidence is temporarily unavailable. No status or sanctions conclusion is inferred.";
                }
            });
        });
    }

    function render() {
        if (!dataset) return;
        const filtered = countries.filter(matches);
        const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        pageNumber = Math.min(pageNumber, pages);
        const start = (pageNumber - 1) * PAGE_SIZE;
        const visible = filtered.slice(start, start + PAGE_SIZE);
        tbody.innerHTML = visible.map(renderRow).join("");
        cards.innerHTML = visible.map(renderCard).join("");
        const listed = dataset.counts.callForAction + dataset.counts.increasedMonitoring;
        summary.textContent = (visible.length ? (start + 1) + "–" + (start + visible.length) : "0") +
            " of " + filtered.length + " matching countries · " + countries.length +
            " countries in the matrix · " + listed + " current official FATF designations · GPIR ratings: 0 · OFAC country conclusions: 0";
        pageStatus.textContent = "Page " + pageNumber + " of " + pages;
        previous.disabled = pageNumber <= 1;
        next.disabled = pageNumber >= pages;
        if (!visible.length) {
            cards.innerHTML = '<p class="risk-empty">No country matches these filters. This is not evidence of a low-risk rating.</p>';
        } else bindAsk();
    }

    async function load() {
        try {
            const [riskResponse, registryResponse] = await Promise.all([
                fetch("../../assets/data/country-risk-monitor.json", { cache: "no-store", headers: { Accept: "application/json" } }),
                fetch("../../assets/data/fx/country-currency-registry.json", { cache: "no-store", headers: { Accept: "application/json" } })
            ]);
            if (!riskResponse.ok || !registryResponse.ok) throw new Error("HTTP");
            const risk = await riskResponse.json();
            const registry = await registryResponse.json();
            if (risk?.schemaVersion !== "GPIR-COUNTRY-RISK-1" || !Array.isArray(risk.countries) ||
                !Array.isArray(registry?.countries) || registry.countries.length < 150) throw new Error("INVALID_DATASET");
            dataset = risk;
            const classified = new Map(risk.countries.map(item => [ALPHA3_TO_ALPHA2[item.countryCode], item]));
            countries = registry.countries.filter(item => item.enabled !== false).map(item => {
                const current = classified.get(item.countryCode);
                if (current) return {
                    ...current,
                    countryCode2: item.countryCode,
                    region: regionLabel(item.region)
                };
                return {
                    countryCode2: item.countryCode,
                    countryCode: item.countryCode,
                    countryName: item.country,
                    slug: slug(item.country),
                    region: regionLabel(item.region),
                    fatfDesignation: "FATF_NOT_LISTED_CURRENT_SNAPSHOT",
                    fatfLabel: "Not listed in current FATF high-risk/monitoring publications",
                    publicationDate: risk.authorityState,
                    sourceUrl: risk.sources.fatfIndex,
                    gpirAnalyticalRisk: "UNRATED",
                    statusHistory: []
                };
            }).sort((left, right) => left.countryName.localeCompare(right.countryName));
            sourceStatus.textContent = "FATF publication 30 October 2026 · retrieved 19 November 2026 · 95% publication threshold preserved";
            [...new Set(countries.map(item => item.region))].sort().forEach(item => {
                const option = document.createElement("option");
                option.value = item;
                option.textContent = item;
                region.append(option);
            });
            render();
        } catch {
            sourceStatus.textContent = "Country-risk evidence is temporarily unavailable. No cached classification is inferred.";
            summary.textContent = "Unavailable";
            cards.innerHTML = '<p class="risk-empty">The validated dataset could not be loaded. Use the official source links below.</p>';
        }
    }

    [search, region, category].forEach(control => control.addEventListener("input", () => {
        pageNumber = 1;
        render();
    }));
    previous.addEventListener("click", () => { if (pageNumber > 1) { pageNumber -= 1; render(); } });
    next.addEventListener("click", () => { pageNumber += 1; render(); });
    void load();
}

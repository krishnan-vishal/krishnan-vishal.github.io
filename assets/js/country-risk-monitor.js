import { contextualAskQuery, retrieveGovernedEvidence, summarizeGovernedAsk }
    from "./gpir-governed-ask.mjs";

const root = document.querySelector("[data-country-risk-monitor]");
if (root) {
    const PAGE_SIZE = 24;
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
    const regionGroups = root.querySelector("[data-risk-region-groups]");
    const regionNav = root.querySelector("[data-risk-region-nav]");
    const expandedRegions = new Set();
    const statusChecks = [...root.querySelectorAll("[data-risk-status-check]")];
    const profilePanel = root.querySelector(".risk-profiles-panel");
    let selectedCountryCode = null;
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

    const ASEAN_CODES = new Set(["BN","KH","ID","LA","MY","MM","PH","SG","TH","TL","VN"]);
    const FAR_EAST_CODES = new Set(["CN","JP","KP","KR","MN","TW","HK","MO"]);
    function dashboardRegion(country) {
        const code = country.countryCode;
        if (country.region === "APAC") {
            if (ASEAN_CODES.has(code)) return "ASEAN";
            if (FAR_EAST_CODES.has(code)) return "Far East";
            return "APAC";
        }
        if (country.region === "EUROPE") return "SEPA / Europe";
        return regionLabel(country.region);
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
        const checked = statusChecks.filter(box => box.checked).map(box => box.value);
        return (!term || text.includes(term))
            && (!region.value || country.region === region.value)
            && (!checked.length || checked.includes(country.fatfDesignation));
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

    function renderCompactCountry(country) {
        const shortStatus = country.fatfDesignation === "FATF_CALL_FOR_ACTION" ? "High Risk" :
            country.fatfDesignation === "FATF_INCREASED_MONITORING" ? "Grey List" : "Not listed";
        return '<a class="risk-compact-country" href="#country-' + escapeHtml(country.slug) +
            '" aria-label="Open ' + escapeHtml(country.countryName) + ' evidence profile">' +
            flagMarkup(country) + '<span class="risk-country-code">' + escapeHtml(country.countryCode2) +
            '</span><strong title="' + escapeHtml(country.countryName) + '">' +
            escapeHtml(country.countryName) + '</strong><span class="' +
            badgeClass(country.fatfDesignation) + '">' + shortStatus +
            '</span><span class="risk-country-action" aria-hidden="true">↗</span></a>';
    }

    function renderRegions(visible, filtered) {
        const regionNames = [...new Set(filtered.map(country => country.region))].sort();
        regionNav.innerHTML = regionNames.map(name => {
            const count = filtered.filter(country => country.region === name).length;
            const active = expandedRegions.has(name);
            return '<button type="button" data-region-toggle="' + escapeHtml(name) +
                '" aria-expanded="' + active + '">' + escapeHtml(name) +
                ' <small>' + count + '</small></button>';
        }).join("");
        const grouped = new Map();
        visible.forEach(country => {
            if (!grouped.has(country.region)) grouped.set(country.region, []);
            grouped.get(country.region).push(country);
        });
        regionGroups.innerHTML = [...grouped.entries()].map(([name, members]) => {
            const open = expandedRegions.size === 0 || expandedRegions.has(name);
            return '<section class="risk-region-section"><button type="button" class="risk-region-title" data-region-toggle="' +
                escapeHtml(name) + '" aria-expanded="' + open + '"><span>▦ ' +
                escapeHtml(name) + '</span><small>' + members.length + ' on this page</small><span>' +
                (open ? '−' : '+') + '</span></button><div class="risk-country-grid"' +
                (open ? '' : ' hidden') + '>' + members.map(renderCompactCountry).join("") + '</div></section>';
        }).join("") || '<p class="risk-empty">No countries match the selected filters.</p>';
        root.querySelectorAll("[data-region-toggle]").forEach(button => button.addEventListener("click", () => {
            const name = button.dataset.regionToggle;
            if (expandedRegions.size === 0) regionNames.forEach(regionName => expandedRegions.add(regionName));
            if (expandedRegions.has(name)) expandedRegions.delete(name); else expandedRegions.add(name);
            render();
        }));
    }

    function render() {
        if (!dataset) return;
        const filtered = countries.filter(matches);
        const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        pageNumber = Math.min(pageNumber, pages);
        const start = (pageNumber - 1) * PAGE_SIZE;
        const visible = filtered.slice(start, start + PAGE_SIZE);
        tbody.innerHTML = visible.map(renderRow).join("");
        const selected = visible.find(country => country.countryCode2 === selectedCountryCode);
        cards.innerHTML = selected ? renderCard(selected) : "";
        profilePanel.hidden = !selected;
        renderRegions(visible, filtered);
        const listed = dataset.counts.callForAction + dataset.counts.increasedMonitoring;
        summary.textContent = (visible.length ? (start + 1) + "–" + (start + visible.length) : "0") +
            " of " + filtered.length + " matching countries · " + countries.length +
            " countries in the matrix · " + listed + " current official FATF designations · GPIR ratings: 0 · OFAC country conclusions: 0";
        pageStatus.textContent = "Page " + pageNumber + " of " + pages;
        previous.disabled = pageNumber <= 1;
        next.disabled = pageNumber >= pages;
        if (selected) bindAsk();
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
                    region: dashboardRegion(item)
                };
                return {
                    countryCode2: item.countryCode,
                    countryCode: item.countryCode,
                    countryName: item.country,
                    slug: slug(item.country),
                    region: dashboardRegion(item),
                    fatfDesignation: "FATF_NOT_LISTED_CURRENT_SNAPSHOT",
                    fatfLabel: "Not listed in current FATF high-risk/monitoring publications",
                    publicationDate: risk.authorityState,
                    sourceUrl: risk.sources.fatfIndex,
                    gpirAnalyticalRisk: "UNRATED",
                    statusHistory: []
                };
            }).sort((left, right) => left.countryName.localeCompare(right.countryName));
            sourceStatus.textContent = "FATF publication 30 October 2026 · retrieved 19 November 2026 · 95% publication threshold preserved";
            const highCount = document.querySelector("[data-risk-high-count]");
            const greyCount = document.querySelector("[data-risk-grey-count]");
            const totalCount = document.querySelector("[data-risk-total-count]");
            if (highCount) highCount.textContent = String(risk.counts.callForAction);
            if (greyCount) greyCount.textContent = String(risk.counts.increasedMonitoring);
            if (totalCount) totalCount.textContent = String(countries.length);
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
    root.querySelectorAll("[data-risk-tab]").forEach(button => button.addEventListener("click", () => {
        const target = button.dataset.riskTab;
        root.querySelectorAll("[data-risk-tab]").forEach(tab => tab.classList.toggle("is-active", tab === button));
        root.querySelectorAll("[data-risk-panel]").forEach(panel => { panel.hidden = panel.dataset.riskPanel !== target; });
    }));
    root.querySelector("[data-risk-clear]")?.addEventListener("click", () => {
        search.value = ""; region.value = ""; category.value = ""; pageNumber = 1;
        statusChecks.forEach(box => { box.checked = false; }); selectedCountryCode = null;
        expandedRegions.clear(); render();
    });
    root.querySelector("[data-risk-show-fatf]")?.addEventListener("click", () => {
        statusChecks.forEach(box => { box.checked = box.value === "FATF_CALL_FOR_ACTION"; });
        category.value = "FATF_CALL_FOR_ACTION"; pageNumber = 1; render();
        root.querySelector('[data-risk-tab="matrix"]')?.click();
    });
    statusChecks.forEach(box => box.addEventListener("change", () => {
        pageNumber = 1; selectedCountryCode = null; render();
    }));
    root.querySelector("[data-risk-profile-close]")?.addEventListener("click", () => {
        selectedCountryCode = null; profilePanel.hidden = true;
    });
    root.addEventListener("click", event => {
        const link = event.target.closest?.(".risk-compact-country");
        if (!link) return;
        event.preventDefault();
        const slugValue = link.getAttribute("href")?.slice("#country-".length);
        const country = countries.find(item => item.slug === slugValue);
        if (!country) return;
        selectedCountryCode = country.countryCode2;
        render();
        const details = profilePanel.querySelector("details");
        if (details) details.open = true;
        profilePanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    const globalAskForm = root.querySelector("[data-risk-global-ask]");
    const globalAskButton = globalAskForm?.querySelector('button[type="submit"]');
    const globalAskTarget = root.querySelector("[data-risk-global-answer]");
    globalAskForm?.addEventListener("submit", async event => {
        event.preventDefault();
        const question = globalAskForm.querySelector("input").value.trim();
        if (!question || !globalAskTarget) return;
        const request = ++askRequest;
        globalAskTarget.setAttribute("role", "status");
        globalAskTarget.textContent = "Checking official FATF classifications and governed regulatory evidence…";
        if (globalAskButton) globalAskButton.disabled = true;
        const questionLower = question.toLowerCase();
        const words = questionLower.split(/[^a-z]+/);
        const aliases = { AE: "uae", US: "usa", GB: "uk" };
        const mentioned = countries.filter(country => {
            const name = country.countryName.toLowerCase();
            return (name.length > 3 && questionLower.includes(name)) || Boolean(aliases[country.countryCode2] && words.includes(aliases[country.countryCode2]));
        }).sort((a,b) => b.countryName.length - a.countryName.length);
        const country = mentioned[0];
        const statusText = country
            ? country.countryName + ": FATF publication status in the dated official FATF source: " + country.fatfLabel + ". GPIR reproduces the official FATF publication status; it does not independently designate jurisdictions or infer OFAC sanctions."
            : "";
        try {
            const origin = globalThis.GPIR_SUPABASE_PUBLIC_CONFIG?.url;
            const query = contextualAskQuery(question, {
                topic: "FATF OFAC regulatory intelligence",
                ...(country ? { country: country.countryName } : {})
            });
            const evidence = await Promise.race([
                retrieveGovernedEvidence(origin, query, { limit: 8 }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("TIMEOUT")), 10000))
            ]);
            if (request !== askRequest || !globalAskForm.isConnected) return;
            const result = summarizeGovernedAsk(question, evidence, {
                topic: "Regulatory intelligence",
                ...(country ? { country: country.countryName } : {})
            });
            const paragraph = document.createElement("p");
            paragraph.textContent = [statusText, result.answer].filter(Boolean).join(" ");
            const citations = document.createElement("ul");
            (result.citations || []).forEach(citation => {
                const li = document.createElement("li");
                if (citation.url && /^https:\/\//i.test(citation.url)) {
                    const a = document.createElement("a");
                    a.href = citation.url;
                    a.textContent = citation.title || "Verified source";
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    li.append(a);
                } else li.textContent = citation.title || "Verified record";
                citations.append(li);
            });
            if (country?.sourceUrl && /^https:\/\//i.test(country.sourceUrl)) {
                const li = document.createElement("li");
                const a = document.createElement("a");
                a.href = country.sourceUrl;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.textContent = "Official FATF classification source";
                li.append(a);
                citations.append(li);
            }
            globalAskTarget.replaceChildren(paragraph);
            if (citations.childElementCount) globalAskTarget.append(citations);
        } catch {
            if (request === askRequest) {
                globalAskTarget.replaceChildren();
                const paragraph = document.createElement("p");
                paragraph.textContent = statusText || "The governed intelligence service did not respond within 10 seconds. No unsupported answer has been generated.";
                globalAskTarget.append(paragraph);
                if (country?.sourceUrl && /^https:\/\//i.test(country.sourceUrl)) {
                    const a = document.createElement("a");
                    a.href = country.sourceUrl;
                    a.textContent = "Verify official FATF evidence";
                    a.target = "_blank";
                    a.rel = "noopener noreferrer";
                    globalAskTarget.append(a);
                }
            }
        } finally {
            if (request === askRequest && globalAskButton) globalAskButton.disabled = false;
        }
    });
    const tabButtons = [...root.querySelectorAll("[data-risk-tab]")];
    function moveDashboard(direction) {
        const active = tabButtons.findIndex(tab => tab.classList.contains("is-active"));
        const matrixActive = active === 0;
        const filteredCount = countries.filter(matches).length;
        const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
        if (matrixActive && direction > 0 && pageNumber < totalPages) {
            pageNumber += 1; selectedCountryCode = null; render(); return;
        }
        if (matrixActive && direction < 0 && pageNumber > 1) {
            pageNumber -= 1; selectedCountryCode = null; render(); return;
        }
        const nextTab = active + direction;
        if (nextTab >= 0 && nextTab < tabButtons.length) {
            tabButtons[nextTab].click();
            tabButtons[nextTab].focus();
            return;
        }
        location.assign("/reader/my-gpir/#library");
    }
    root.querySelector("[data-risk-back]")?.addEventListener("click", () => moveDashboard(-1));
    root.querySelector("[data-risk-forward]")?.addEventListener("click", () => moveDashboard(1));
    void load();
}

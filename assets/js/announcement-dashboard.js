(function(){
    "use strict";

    const root = document.querySelector("[data-announcement-dashboard]");
    if(!root || !window.GPIRAnnouncementLifecycle) return;

    const lifecycle = window.GPIRAnnouncementLifecycle;
    const dataUrl = root.getAttribute("data-source") || "../../assets/data/announcements.json";
    const asOf = root.getAttribute("data-as-of") || new Date().toISOString();
    const fields = ["region", "country", "category", "subcategory"];
    const escapeHtml = value => String(value == null ? "" : value).replace(/[&<>\"']/g, character => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[character]);
    const valueFor = (record, field) => record[field] || (field === "subcategory" ? record.subCategory : "") || "Unspecified";
    const dateFor = record => record.publicationDate || record.publishedDate || "";

    function setOptions(records){
        fields.forEach(field => {
            const select = root.querySelector(`[data-filter="${field}"]`);
            if(!select) return;
            [...new Set(records.map(record => valueFor(record, field)).filter(Boolean))].sort().forEach(value => {
                const option = document.createElement("option");
                option.value = value;
                option.textContent = value;
                select.appendChild(option);
            });
        });
    }

    function filtered(records){
        const from = root.querySelector('[data-filter="from"]').value;
        const to = root.querySelector('[data-filter="to"]').value;
        return records.filter(record => fields.every(field => {
            const selected = root.querySelector(`[data-filter="${field}"]`).value;
            return !selected || valueFor(record, field) === selected;
        }) && (!from || dateFor(record) >= from) && (!to || dateFor(record) <= to));
    }

    function card(record){
        const source = record.sourceUrl || (record.source && record.source.url);
        return `<article class="announcement-dashboard-card"><p class="announcement-card-meta-row"><span>${escapeHtml(dateFor(record))}</span><span>${escapeHtml(valueFor(record, "country"))}</span><span>${escapeHtml(valueFor(record, "category"))}</span></p><h4><a href="${escapeHtml(record.id)}.html">${escapeHtml(record.headline || record.tickerHeadline || record.title)}</a></h4><p>${escapeHtml(record.summary || record.whyItMatters || "")}</p><p class="announcement-card-status-row"><span class="announcement-card-status">${escapeHtml(record.validationStatus || "VALIDATED")}</span>${source ? `<a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">Original source</a>` : ""}</p></article>`;
    }

    function render(records){
        const selected = filtered(records);
        const parts = lifecycle.partition(selected, asOf);
        root.querySelector("[data-counts]").textContent = `${parts.live.length} live · ${parts.archive.length} archived · ${parts.developing.length} awaiting validation`;
        root.querySelector("[data-live]").innerHTML = parts.live.length ? parts.live.map(card).join("") : '<p class="ticker-empty">No validated announcements are inside the latest 24-hour window.</p>';

        const groups = new Map();
        parts.archive.forEach(record => {
            const key = [record.gpirSection || "Global Announcements", valueFor(record, "region"), valueFor(record, "country"), valueFor(record, "subcategory")];
            const label = key.join(" › ");
            if(!groups.has(label)) groups.set(label, []);
            groups.get(label).push(record);
        });
        root.querySelector("[data-archive]").innerHTML = [...groups.entries()].sort(([a],[b]) => a.localeCompare(b)).map(([label, items]) => `<section class="announcement-dashboard-group"><h3>${escapeHtml(label)}</h3>${items.sort((a,b) => dateFor(b).localeCompare(dateFor(a))).map(card).join("")}</section>`).join("") || "<p>No archived records match these filters.</p>";

        const tally = (field) => [...selected.reduce((map, record) => map.set(valueFor(record, field), (map.get(valueFor(record, field)) || 0) + 1), new Map()).entries()].sort(([a],[b]) => a.localeCompare(b));
        root.querySelector("[data-stats]").innerHTML = `<strong>By category:</strong> ${tally("category").map(([name,count]) => `${escapeHtml(name)} (${count})`).join(" · ") || "None"}<br><strong>By region:</strong> ${tally("region").map(([name,count]) => `${escapeHtml(name)} (${count})`).join(" · ") || "None"}`;
    }

    fetch(dataUrl).then(response => {
        if(!response.ok) throw new Error("Announcement data unavailable");
        return response.json();
    }).then(data => {
        const records = data.records || [];
        setOptions(records);
        root.querySelectorAll("select,input").forEach(control => control.addEventListener("change", () => render(records)));
        root.querySelector("[data-reset]").addEventListener("click", () => {
            root.querySelectorAll("select,input").forEach(control => { control.value = ""; });
            render(records);
        });
        render(records);
    }).catch(() => {
        root.querySelector("[data-counts]").textContent = "Validated announcement data is temporarily unavailable; the last-known-good publication remains unchanged.";
    });
}());

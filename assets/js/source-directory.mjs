const regions = [
    "ASEAN", "CIS", "Far East", "APAC", "Oceania", "LATAM", "North America & Canada",
    "GCC", "South Asia", "Africa", "Europe/SEPA", "UK"
];
const route = "/pages/risk/global-central-banks.html";
const kinds = [["bank", "Central banks"], ["association", "Fintech and payments associations"]];

function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
}

function link(href, text) {
    const anchor = element("a", text);
    anchor.href = href;
    return anchor;
}

function flag(code) {
    return /^[A-Z]{2}$/.test(code) ? Array.from(code, character =>
        String.fromCodePoint(character.codePointAt(0) + 127397)).join("") : "";
}

function cardView(card) {
    const article = document.createElement("article");
    article.append(element("h3", card.name));
    if (card.country_code) {
        article.append(element("p", `${flag(card.country_code)} ${card.country}`),
            element("p", card.summary), element("p", card.coverage));
        const url = new URL(card.official_url);
        if (url.protocol === "https:" && !url.username && !url.password) {
            const source = link(url.href, "Official website");
            source.target = "_blank";
            source.rel = "noopener noreferrer";
            article.append(source);
        }
    }
    return article;
}

function filterControl(container, labelText, choices) {
    const label = element("label", labelText);
    const select = document.createElement("select");
    for (const [value, text] of choices) select.add(new Option(text, value));
    label.append(select);
    container.append(label);
    return select;
}

async function initialize(directory) {
    const preview = directory.hasAttribute("data-directory-preview");
    const status = directory.querySelector("[data-directory-status]");
    const grid = directory.querySelector("[data-directory-cards]");
    const filters = directory.querySelector("[data-directory-filters]");
    const region = filterControl(filters, "Region", regions.map(name => [name, name]));
    const kind = filterControl(filters, "Source type", kinds);
    const requestedRegion = new URL(location.href).searchParams.get("region");
    if (regions.includes(requestedRegion)) region.value = requestedRegion;

    const config = window.GPIR_SUPABASE_PUBLIC_CONFIG;
    const session = preview ? null : await window.GPIRReaderAuth?.sessionReady;
    const key = config?.publishableKey;
    if (!config?.url || !key) throw Error("Missing directory configuration");
    const headers = new Headers();
    headers.set("apikey", key);
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
    const response = await fetch(`${config.url}/functions/v1/gpir-source-directory`, { headers, cache: "no-store" });
    if (!response.ok) throw Error("Directory unavailable");
    const { cards, access } = await response.json();

    function render() {
        const matches = cards.filter(card => card.region === region.value && card.kind === kind.value);
        grid.replaceChildren(...matches.map(cardView));
        status.replaceChildren();
        if (!matches.length) status.append("No sources are listed in this view. ");
        if (preview) status.append(link(`${route}?region=${encodeURIComponent(region.value)}`, "Open the directory"));
        else if (access === "UNAUTHENTICATED") {
            status.append("Public preview. ", link(`/reader/sign-in/?returnTo=${encodeURIComponent(location.pathname + location.search)}`, "Sign in"));
        } else if (access === "DENY") status.append("Public preview. ", link("/reader/plan/", "View subscription plans"));
    }
    region.addEventListener("change", render);
    kind.addEventListener("change", render);
    render();
}

for (const directory of document.querySelectorAll("[data-source-directory]")) {
    initialize(directory).catch(() => {
        directory.querySelector("[data-directory-status]").textContent = "The source directory is temporarily unavailable.";
    });
}

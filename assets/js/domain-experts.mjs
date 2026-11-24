const get = id => document.getElementById('expert-' + id);
const form = get('filters');
const cards = get('regional-cards');
const detail = get('profile');
const heading = get('detail-title');
const status = get('status');
const regions = ['APAC','CIS','SEPA / Europe / UK','South Asia','Americas','LATAM','Africa','GCC / Middle East'];
const geography = {
  "APAC": "Australia|Brunei|Cambodia|China|Fiji|Hong Kong|Indonesia|Japan|Kiribati|Laos|Macau|Malaysia|Marshall Islands|Micronesia|Mongolia|Myanmar|Nauru|New Zealand|North Korea|Palau|Papua New Guinea|Philippines|Samoa|Singapore|Solomon Islands|South Korea|Taiwan|Thailand|Timor-Leste|Tonga|Tuvalu|Vanuatu|Vietnam",
  "CIS": "Armenia|Azerbaijan|Belarus|Georgia|Kazakhstan|Kyrgyzstan|Moldova|Russia|Tajikistan|Turkmenistan|Ukraine|Uzbekistan",
  "SEPA / Europe / UK": "Albania|Andorra|Austria|Belgium|Bosnia and Herzegovina|Bulgaria|Croatia|Cyprus|Czechia|Denmark|Estonia|Finland|France|Germany|Greece|Hungary|Iceland|Ireland|Italy|Kosovo|Latvia|Liechtenstein|Lithuania|Luxembourg|Malta|Monaco|Montenegro|Netherlands|North Macedonia|Norway|Poland|Portugal|Romania|San Marino|Serbia|Slovakia|Slovenia|Spain|Sweden|Switzerland|United Kingdom|Vatican City",
  "South Asia": "Afghanistan|Bangladesh|Bhutan|India|Maldives|Nepal|Pakistan|Sri Lanka",
  "Americas": "Canada|United States",
  "LATAM": "Antigua and Barbuda|Argentina|Bahamas|Barbados|Belize|Bolivia|Brazil|Chile|Colombia|Costa Rica|Cuba|Dominica|Dominican Republic|Ecuador|El Salvador|Grenada|Guatemala|Guyana|Haiti|Honduras|Jamaica|Mexico|Nicaragua|Panama|Paraguay|Peru|Saint Kitts and Nevis|Saint Lucia|Saint Vincent and the Grenadines|Suriname|Trinidad and Tobago|Uruguay|Venezuela",
  "Africa": "Algeria|Angola|Benin|Botswana|Burkina Faso|Burundi|Cabo Verde|Cameroon|Central African Republic|Chad|Comoros|Democratic Republic of the Congo|Republic of the Congo|Djibouti|Egypt|Equatorial Guinea|Eritrea|Eswatini|Ethiopia|Gabon|Gambia|Ghana|Guinea|Guinea-Bissau|Ivory Coast|Kenya|Lesotho|Liberia|Libya|Madagascar|Malawi|Mali|Mauritania|Mauritius|Morocco|Mozambique|Namibia|Niger|Nigeria|Rwanda|Sao Tome and Principe|Senegal|Seychelles|Sierra Leone|Somalia|South Africa|South Sudan|Sudan|Tanzania|Togo|Tunisia|Uganda|Zambia|Zimbabwe",
  "GCC / Middle East": "Bahrain|Iran|Iraq|Israel|Jordan|Kuwait|Lebanon|Oman|Palestine|Qatar|Saudi Arabia|Syria|Turkey|United Arab Emirates|Yemen"
};
function countryOptions(published = []) {
    const region = filters.get('region');
    const names = region ? (geography[region] || '').split('|') : Object.values(geography).flatMap(value => value.split('|'));
    return [...new Set([...names, ...published].filter(Boolean))].sort((a,b) => a.localeCompare(b));
}
let activeView = 'profiles';
let filters = new URLSearchParams();
let selectedButton = null;
let pending = null;
let session;
const route = '/pages/intelligence/domain-experts.html';

function element(tag, text) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
}

function safeUrl(raw) {
    try {
        const url = new URL(raw);
        if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    } catch {}
    return null;
}

function link(raw, label) {
    const url = safeUrl(raw);
    if (!url) return element('span', label);
    const anchor = element('a', label);
    anchor.href = url;
    anchor.rel = 'noopener noreferrer';
    return anchor;
}

function claim(item) {
    const node = element('p', [item.period, item.text].filter(Boolean).join(' · '));
    if (item.source) {
        const citation = element('small');
        citation.append(link(item.source.url, item.source.publisher), ' · Checked ' + item.source.checkedAt);
        node.append(citation);
    }
    return node;
}

function appendSection(label, items) {
    if (!items?.length) return;
    const section = element('details');
    section.append(element('summary', label), ...items.map(claim));
    detail.append(section);
}

function initials(name) {
    return name.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0]).join('');
}

function showProfile(card, button) {
    selectedButton?.removeAttribute('aria-current');
    selectedButton = button;
    button.setAttribute('aria-current', 'true');
    heading.textContent = card.name;
    get('placeholder').hidden = true;
    detail.replaceChildren();
    const identity = element('p');
    identity.className = 'expert-profile-identity';
    const fallback = element('span', initials(card.name));
    fallback.setAttribute('aria-hidden', 'true');
    identity.append(fallback, [card.title, card.employer, card.jurisdiction].filter(Boolean).join(' · '));
    const portrait = safeUrl(card.portrait?.url);
    if (portrait && card.portrait.identityConfirmed && card.portrait.reuseLicense) {
        const image = element('img');
        image.alt = '';
        image.title = card.portrait.reuseLicense;
        image.referrerPolicy = 'no-referrer';
        image.addEventListener('error', () => image.replaceWith(fallback), { once: true });
        fallback.replaceWith(image);
        image.src = portrait;
    }
    detail.append(identity, claim(card.summary), element('p', card.topics.join(' · ')));
    appendSection('Career history', card.career);
    appendSection('Qualifications', card.qualifications);
    appendSection('Significant contribution', [card.contribution]);
    appendSection('Recognition', card.recognition);
    appendSection('Correction history', card.corrections);
    const sources = element('details');
    const official = element('p');
    official.append(link(card.officialBio.url, 'Official biography · ' + card.officialBio.publisher),
        ' · Checked ' + card.officialBio.checkedAt);
    sources.append(element('summary', 'Sources'), official, element('p', 'Last reviewed ' + card.checkedAt));
    if (card.linkedin?.identityConfirmed) sources.append(link(card.linkedin.url, 'LinkedIn profile'));
    const back = element('button', 'Back to selected result');
    back.type = 'button';
    back.addEventListener('click', () => selectedButton?.focus());
    detail.append(sources, back);
    heading.focus();
}

function resetProfile() {
    selectedButton = null;
    heading.textContent = 'Expert profile';
    get('placeholder').hidden = false;
    detail.replaceChildren();
}
/**
 * @param {string} name
 * @param {string[]} values
 */
function options(name, values) {
    const control = form.elements.namedItem(name);
    const selected = filters.get(name) || '';
    control.replaceChildren(control.options[0], ...values.map(value => new Option(value, value)));
    control.value = selected;
}

function showView(view) {
    activeView = view;
    const byDomain = view === 'domain';
    get('show-domain').setAttribute('aria-pressed', String(byDomain));
    get('show-profiles').setAttribute('aria-pressed', String(!byDomain));
    get('domains').hidden = !byDomain;
    get('browser').hidden = byDomain;
}

function renderRegionalCards(profiles, jurisdictions) {
    cards.replaceChildren();
    const grouped = new Map((filters.get('region') ? [filters.get('region')] : regions).map(region => [region, []]));
    for (const p of profiles) {
        const region = filters.get('region') || p.regions?.[0] || 'Global';
        if (!grouped.has(region)) grouped.set(region, []);
        grouped.get(region).push(p);
    }
    const regionOrder = ['Global', 'Africa', 'Americas', 'Asia Pacific', 'Europe', 'Middle East', 'Latin America'];
    const sorted = [...grouped.entries()].sort((a, b) => {
        const ia = regionOrder.indexOf(a[0]);
        const ib = regionOrder.indexOf(b[0]);
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    for (const [region, people] of sorted) {
        people.sort((a, b) => (a.sortKey || a.name || '').localeCompare(b.sortKey || b.name || ''));
        const card = element('div');
        card.className = 'region-card';
        card.append(element('h3', region));
        card.append(element('p', people.length ? people.length + ' profiles on this page' : 'No published profiles on this page.'));
        const list = element('ul');
        for (const p of people) {
            const row = element('li');
            const button = element('button', p.name + ' · ' + (p.title || ''));
            button.type = 'button';
            button.addEventListener('click', () => showProfile(p, button));
            row.append(button);
            list.append(row);
        }
        card.append(list);
        cards.append(card);
    }
}

function renderDomains(topics) {
    const list = get('domain-list');
    list.replaceChildren();
    get('domains-empty').hidden = topics.length > 0;
    for (const topic of topics) {
        const row = element('li');
        const button = element('button', topic);
        button.type = 'button';
        button.addEventListener('click', () => {
            form.reset();
            filters = new URLSearchParams({ topic });
            showView('profiles');
            get('results-title').focus();
            load();
        });
        row.append(button);
        list.append(row);
    }
}

async function load() {
    pending?.abort();
    const request = new AbortController();
    pending = request;
    const params = new URLSearchParams(filters);
    params.set('catalog', 'experts');
    status.textContent = 'Loading directory…';
    cards.replaceChildren();
    get('pagination').hidden = true;
    resetProfile();
    get('browser').setAttribute('aria-busy', 'true');
    const config = window.GPIR_SUPABASE_PUBLIC_CONFIG;
    try {
        if (!config?.url || !config.publishableKey) throw Error('Unavailable');
        const headers = new Headers();
        headers.set('apikey', config.publishableKey);
        if (session?.access_token) headers.set('authorization', 'Bearer ' + session.access_token);
        const response = await fetch(config.url + '/functions/v1/gpir-source-directory?' + params, {
            headers, cache: 'no-store', signal: request.signal
        });
        if (!response.ok) throw Error('Unavailable');
        const data = await response.json();
        if (request.signal.aborted) return;
        if (data.access === 'DENY' || data.access === 'UNAUTHENTICATED') {
            get('browser').hidden = get('domains').hidden = get('views').hidden = true;
            const access = get('access');
            const action = access.querySelector('a');
            if (data.access === 'DENY') {
                action.textContent = 'Manage subscription in My GPIR';
                action.href = '/reader/my-gpir/';
            } else {
                action.textContent = 'Sign in to access the subscriber directory';
                action.href = '/reader/sign-in/?returnTo=' + encodeURIComponent(route);
            }
            access.hidden = false;
            status.textContent = 'The expert directory requires a GPIR subscription.';
            return;
        }
        if (data.access !== 'ALLOW' || !Array.isArray(data.cards)) throw Error('Unavailable');
        get('access').hidden = true;
        get('views').hidden = false;
        showView(activeView);
        renderDomains(data.topics || []);
        options('region', [...new Set([...regions, ...(data.regions || [])])]);
        options('jurisdiction', countryOptions(data.jurisdictions || []));
        renderRegionalCards(data.cards, data.jurisdictions || []);
        const page = Number(filters.get('page') || 1);
        const total = data.total;
        status.textContent = total + ' matching published expert profiles.';
        get('page-label').textContent = total ? 'Page ' + page + ' of ' + Math.ceil(total / 20) : 'No results';
        get('previous').disabled = page <= 1;
        get('next').disabled = page * 20 >= total || page >= 1000;
        get('pagination').hidden = total <= 20;
    } catch {
        if (!request.signal.aborted) status.textContent = 'The directory is temporarily unavailable. Reload the page to try again.';
    } finally {
        if (!request.signal.aborted) get('browser').removeAttribute('aria-busy');
    }
}

form.elements.namedItem('region').addEventListener('change', () => {
    form.elements.namedItem('jurisdiction').value = '';
    filters = new URLSearchParams([...new FormData(form)].filter(([, value]) => value.trim()));
    options('jurisdiction', countryOptions());
    load();
});
form.addEventListener('submit', event => {
    event.preventDefault();
    filters = new URLSearchParams([...new FormData(form)].filter(([, value]) => value.trim()));
    load();
});
form.addEventListener('reset', () => {
    if (activeView === 'domain') return;
    filters = new URLSearchParams();
    queueMicrotask(() => load());
});
for (const [id, delta] of [['previous', -1], ['next', 1]]) {
    get(id).addEventListener('click', () => {
        filters.set('page', String(Math.max(1, Math.min(1000, Number(filters.get('page') || 1) + delta))));
        load();
    });
}
get('show-domain').addEventListener('click', () => showView('domain'));
get('show-profiles').addEventListener('click', () => showView('profiles'));
try {
    session = await window.GPIRReaderAuth?.sessionReady;
} catch {}
load();

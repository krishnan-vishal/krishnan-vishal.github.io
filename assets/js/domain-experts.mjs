const get = id => document.getElementById('expert-' + id);
const form = get('filters');
const results = get('results');
const detail = get('profile');
const heading = get('detail-title');
const status = get('status');
let currentPage = 1;
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
            form.elements.namedItem('topic').value = topic;
            filters = new URLSearchParams({ topic });
            showView('profiles');
            get('results-title').focus();
            load(1, true);
        });
        row.append(button);
        list.append(row);
    }
}

async function load(page = 1, moveFocus = false) {
    pending?.abort();
    const request = new AbortController();
    pending = request;
    const params = new URLSearchParams(filters);
    params.set('page', page);
    params.set('catalog', 'experts');
    status.textContent = 'Loading experts…';
    results.replaceChildren();
    resetProfile();
    get('browser').setAttribute('aria-busy', 'true');
    get('previous').disabled = get('next').disabled = true;
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
        renderDomains(data.topics);
        for (const [field, key] of [['region', 'regions'], ['industry', 'industries'], ['topic', 'topics']]) {
            options(field, data[key]);
        }
        for (const card of data.cards) {
            const row = element('li');
            const button = element('button', card.name + ' · ' + card.title);
            button.type = 'button';
            button.addEventListener('click', () => showProfile(card, button));
            row.append(button);
            results.append(row);
        }
        currentPage = page;
        const pages = Math.ceil(data.total / 20);
        status.textContent = data.total === 0
            ? (filters.size ? 'No published experts match these filters.' : 'No expert profiles have been published yet.')
            : data.total + ' matching profiles. Page ' + page + ' of ' + pages + '.';
        get('previous').disabled = page <= 1;
        get('next').disabled = page >= pages;
        if (moveFocus && activeView === 'profiles') get('results-title').focus();
    } catch {
        if (!request.signal.aborted) status.textContent = 'The directory is temporarily unavailable. Reload the page to try again.';
    } finally {
        if (!request.signal.aborted) get('browser').removeAttribute('aria-busy');
    }
}

for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') form.elements.namedItem('letter').add(new Option(letter));
form.addEventListener('submit', event => {
    event.preventDefault();
    filters = new URLSearchParams([...new FormData(form)].filter(([, value]) => value.trim()));
    load(1, true);
});
form.addEventListener('reset', () => {
    if (activeView === 'domain') return;
    filters = new URLSearchParams();
    queueMicrotask(() => load(1, true));
});
get('show-domain').addEventListener('click', () => showView('domain'));
get('show-profiles').addEventListener('click', () => showView('profiles'));
get('previous').addEventListener('click', () => load(currentPage - 1, true));
get('next').addEventListener('click', () => load(currentPage + 1, true));
try {
    session = await window.GPIRReaderAuth?.sessionReady;
} catch {}
load();

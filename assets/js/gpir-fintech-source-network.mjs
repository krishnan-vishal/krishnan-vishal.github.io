const get = id => document.getElementById(id);
const route = '/pages/intelligence/trusted-source-network.html';
const palette = {
    'North America': ['#2375a8', '#dceffd'], 'LATAM': ['#ad6112', '#fff1d8'],
    'Europe & UK': ['#314ba5', '#e1e9ff'], 'APAC': ['#206a97', '#dff3ff'],
    'GCC': ['#18745e', '#e2f5ea'], 'Africa': ['#762e92', '#f0e5fa'],
    'Oceania': ['#12668e', '#e3f4fc'], 'Global': ['#536680', '#e8eef6']
};
const aliases = {Europe:'Europe & UK', 'GCC / MENA':'GCC', MENA:'GCC', 'Middle East':'GCC',
    'Southeast Asia':'APAC', 'Asia-Pacific':'APAC', Americas:'North America'};
const groupOf = name => aliases[name] || name;
const rowGroups = row => row.regions.length ? row.regions.map(groupOf) : ['Global'];
function node(tag,text) {
    const element = document.createElement(tag);
    element.textContent = text;
    return element;
}
function externalLink(text,url) {
    try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
        const a = node('a',text);
        a.href = parsed.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
        return a;
    } catch { return null; }
}
async function loadAlerts(url) {
    try {
        const response = await fetch(url + '/functions/v1/gpir-public-intelligence?view=relay');
        if (!response.ok) throw Error('Alerts unavailable');
        const {status, view, windowHours, items: alerts} = await response.json();
        if (status !== 'OK' || view !== 'relay' || windowHours !== 12 || !Array.isArray(alerts)) throw Error('Invalid alerts response');
        get('liveCount').textContent = alerts.length;
        const headline = alerts[0]?.headline || alerts[0]?.title;
        get('alertState').textContent = alerts.length
            ? alerts.length + ' verified live alerts' + (headline ? ' · ' + headline : '')
            : 'No verified alerts in the last 12 hours';
    } catch {
        get('alertState').textContent = 'Live alerts temporarily unavailable';
    }
}
async function load() {
    const config = window.GPIR_SUPABASE_PUBLIC_CONFIG;
    if (!config?.url || !config.publishableKey) throw Error('Directory configuration unavailable');
    void loadAlerts(config.url);
    const params = new URL(location.href).searchParams;
    const previewOnly = params.get('view') === 'preview' || params.get('from') !== 'my-gpir';
    if (previewOnly && params.get('embed') === '1') document.body.classList.add('homepage-network');
    const fromMyGpir = params.get('from') === 'my-gpir' && !previewOnly;
    if (fromMyGpir) {
        get('entryContext').textContent = 'My GPIR / Trusted Source Network';
        get('myGpirBack').hidden = false;
    }
    const session = await window.GPIRReaderAuth?.sessionReady;
    const headers = new Headers();
    headers.set('apikey', config.publishableKey);
    if (!previewOnly && session?.access_token) headers.set('Authorization', 'Bearer ' + session.access_token);
    const [response, maps] = await Promise.all([
        fetch(config.url + '/functions/v1/gpir-source-directory?catalog=fintech' + (previewOnly ? '&view=preview' : ''),{headers,cache:'no-store'}),
        fetch('/assets/data/gpir-source-network-map.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    if (!response.ok) throw Error('Source network unavailable');
    const {cards: returnedCards,access,totals} = await response.json();
    if (!Array.isArray(returnedCards) || !totals) throw Error('Invalid source network response');
    const full = !previewOnly && access === 'ALLOW';
    const cards = full ? returnedCards : returnedCards.slice(0, Math.floor(totals.sources / 10));
    get('lockedCatalog').hidden = full;
    if (!full) get('lockedTitle').textContent =
        (totals.sources - cards.length) + ' additional source records · subscriber access';
    get('approved').textContent = totals.approved;
    get('total').textContent = totals.sources;
    get('categories').textContent = totals.categories;
    get('coverage').textContent = totals.regions;
    get('access').textContent = full ? 'Full directory' : 'Public preview';
    get('unlock').hidden = full;
    const unlock = get('unlockLink');
    function updateUnlock() {
        if (session?.access_token) {
            unlock.href = previewOnly ? '/reader/my-gpir/' : '/reader/my-gpir/#plan';
            unlock.textContent = previewOnly ? 'Open My GPIR' : 'View subscription options';
            return;
        }
        const target = new URL(location.href);
        target.searchParams.delete('view');
        target.searchParams.delete('embed');
        target.searchParams.set('from','my-gpir');
        unlock.href = '/reader/sign-in/?returnTo=' + encodeURIComponent(target.pathname + target.search);
    }
    updateUnlock();
    const groups = [...new Set(cards.flatMap(row => row.regions.map(groupOf)))];
    const regions = [...new Set([...Object.keys(palette), ...groups])];
    const matrices = [...new Set(cards.flatMap(row => row.sets))].sort();
    function option(select,text,value) { const element = node('option',text); element.value = value; select.append(element); }
    option(get('region'),'All regions','');
    for (const region of regions) option(get('region'),region,region);
    for (const matrix of matrices) option(get('matrix'),matrix,matrix);
    for (const category of [...new Set(cards.map(row => row.category))].sort()) {
        option(get('category'),category,category);
        const button = node('button',category);
        button.type = 'button';
        button.dataset.category = category;
        button.setAttribute('aria-pressed','false');
        button.onclick = () => {
            get('category').value = get('category').value === category ? '' : category;
            render();
            get('category').focus();
        };
        get('categoryLinks').append(button);
    }
    const initial = groupOf(params.get('region'));
    if (regions.includes(initial)) get('region').value = initial;
    if (params.get('status') === 'approved') get('status').value = 'approved';

    function syncMatrix() {
        const region = get('region').value;
        const available = new Set(cards.filter(row => !region || rowGroups(row).includes(region)).flatMap(row => row.sets));
        for (const option of get('matrix').options) option.disabled = Boolean(option.value && !available.has(option.value));
        if (get('matrix').selectedOptions[0]?.disabled) get('matrix').value = '';
    }
    function pick(region, focusFilter = true) {
        get('region').value = region;
        if (focusFilter) {
            // A map selection opens the region's directory independently of prior filters.
            for (const id of ['search', 'matrix', 'category', 'status']) get(id).value = '';
        }
        const url = new URL(location.href);
        if (region) url.searchParams.set('region',region);
        else url.searchParams.delete('region');
        if (focusFilter) url.searchParams.delete('status');
        history.replaceState(null,'',url);
        updateUnlock();
        syncMatrix();
        render();
        if (focusFilter) get('region').focus();
    }
    function regionLink(name, label) {
        const link = node('a',label);
        const url = new URL(route,location.origin);
        if (previewOnly) url.searchParams.set('view','preview');
        if (fromMyGpir) url.searchParams.set('from','my-gpir');
        if (params.get('embed') === '1') url.searchParams.set('embed','1');
        if (name) url.searchParams.set('region',name);
        link.href = url.href;
        link.addEventListener('click', event => {
            if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            pick(name);
        });
        return link;
    }
    function mapPanel() {
        const panel = node('section',''); panel.className = 'map-panel';
        panel.append(node('strong','Source network by region'));
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns,'svg');
        svg.setAttribute('viewBox','0 0 1000 500');
        svg.setAttribute('aria-label','Select a region on the map');
        for (const [name, outline] of Object.entries(maps.shapes || {})) {
            const path = document.createElementNS(ns,'path');
            path.setAttribute('d',outline);
            path.setAttribute('fill',palette[name][0]);
            path.setAttribute('fill-opacity','.75');
            svg.append(path);
        }
        const markers = {
            'North America':[222,134], LATAM:[327,340], 'Europe & UK':[525,111],
            Africa:[535,267], GCC:[631,198], APAC:[788,187], Oceania:[891,384]
        };
        for (const [name, [x,y]] of Object.entries(markers)) {
            const a = document.createElementNS(ns,'a');
            a.setAttribute('href',regionLink(name,name).href);
            a.setAttribute('aria-label',name);
            a.addEventListener('click',event => {
                if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                pick(name);
            });
            const dot = document.createElementNS(ns,'circle');
            for (const [key,value] of Object.entries({cx:x,cy:y,r:21,fill:palette[name][0]})) dot.setAttribute(key,value);
            const title = document.createElementNS(ns,'title');
            title.textContent = name;
            a.append(title,dot);
            svg.append(a);
        }
        if (svg.childNodes.length) panel.append(svg);
        const links=node('nav','');links.setAttribute('aria-label','Map regions');
        for (const name of regions) {
            const link = regionLink(name,name);
            if (get('region').value === name) link.setAttribute('aria-current','true');
            links.append(link);
        }
        panel.append(links);
        return panel;
    }
    function renderCard(row, expanded) {
        const card=node('article','');
        const status=node('span',row.approved?'Registry-approved':row.category==='Validation reference'?'Validation reference':'Candidate');
        status.className='tag'+(row.approved?' approved':'');
        card.append(status,node('h4',row.name),node('p',row.category));
        if (full && expanded) {
            if (row.summary) card.append(node('p',row.summary));
            const links=node('nav','');links.setAttribute('aria-label',row.name+' links');
            for (const [title,url] of [['Official website',row.site],['Announcement target',row.target]]) {
                if (!url || (title==='Announcement target' && url===row.site)) continue;
                const a=externalLink(title,url);
                if(a)links.append(a);
            }
            if(links.childNodes.length) card.append(links);
        }
        return card;
    }
    function renderPanel(name, rows, expanded) {
        const panel = node('section','');
        panel.className = 'region-panel';
        const [color,tint] = palette[name] || palette.Global;
        panel.style.setProperty('--region',color);
        panel.style.setProperty('--tint',tint);
        const title = node('h3','');
        const label = name + ' · ' + rows.length;
        title.append(expanded ? document.createTextNode(label) : regionLink(name,label));
        const grid = node('div','');
        grid.className = 'region-grid';
        const limit = expanded ? rows.length : 6;
        grid.append(...rows.slice(0,limit).map(row => renderCard(row,expanded)));
        panel.append(title,grid);
        if (rows.length > limit || (full && !expanded)) {
            const link = regionLink(name,'Explore ' + name + ' →');
            link.className = 'region-more';
            panel.append(link);
        }
        return panel;
    }
    function render() {
        const region = get('region').value;
        const matrix = get('matrix').value;
        const status = get('status').value;
        const category = get('category').value;
        const query = get('search').value.trim().toLowerCase();
        const matched = cards.filter(row => (!region || rowGroups(row).includes(region))
            && (!matrix || row.sets.includes(matrix)) && (!status || row.approved === (status === 'approved'))
            && (!category || row.category === category)
            && [row.name,row.category,full ? row.summary : '',...row.regions].join(' ').toLowerCase().includes(query));
        get('summary').textContent = matched.length + ' ' + (full ? 'sources' : 'preview sources') + ' · ' + (region || 'All regions');
        for (const button of get('categoryLinks').children) {
            button.setAttribute('aria-pressed',String(button.dataset.category === category));
        }
        const root = get('cards');
        root.replaceChildren();
        root.classList.toggle('region-focus',Boolean(region));
        root.append(mapPanel());
        if (region) {
            const results = node('div','');
            results.className = 'network-column region-results';
            results.append(regionLink('','← All regions'));
            if (matched.length) results.append(renderPanel(region,matched,true));
            root.append(results);
        } else {
            const layout = [
                ['North America', 'APAC'],
                ['GCC', 'LATAM'],
                ['Europe & UK', 'Africa', 'Oceania']
            ];
            layout[2].push(...regions.filter(name => !layout.flat().includes(name)));
            for (const [index, names] of layout.entries()) {
                const panels = names.flatMap(name => {
                    const rows = matched.filter(row => rowGroups(row).includes(name));
                    return rows.length ? [renderPanel(name, rows, false)] : [];
                });
                const column = node('div','');
                column.className = 'network-column network-column-' + (index + 1);
                if (index === 1) column.append(root.querySelector('.map-panel'));
                column.append(...panels);
                root.append(column);
            }
        }
        if (!matched.length) {
            const empty = node('p','No sources match these filters. Reset filters or select another region on the map.');
            empty.className = 'network-empty';
            root.append(empty);
        }
    }
    get('resetFilters').onclick = () => pick('');
    get('search').oninput = render;
    get('region').onchange = () => pick(get('region').value,false);
    get('status').onchange = get('matrix').onchange = get('category').onchange = render;
    syncMatrix();
    render();
}
load().catch(() => {
    get('summary').textContent = 'The source network is temporarily unavailable.';
    get('access').textContent = 'Unavailable';
});

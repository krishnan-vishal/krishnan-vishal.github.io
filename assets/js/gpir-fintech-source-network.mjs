const get = id => document.getElementById(id);
function node(tag, content) {
    const element = document.createElement(tag);
    element.textContent = content;
    return element;
}
function link(text, url) {
    const href = new URL(url);
    if (href.protocol !== 'https:' || href.username || href.password) return null;
    const anchor = node('a', text);
    anchor.href = href.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    return anchor;
}
async function start() {
    const response = await fetch('/assets/data/gpir-fintech-source-network.json');
    if (!response.ok) throw Error('Source network unavailable');
    const data = await response.json();
    const regions = [...new Set(data.flatMap(row => row.regions))].sort();
    const matrices = [...new Set(data.flatMap(row => row.sets))].sort();
    for (const matrix of matrices) {
        const option = node('option', matrix);
        option.value = matrix;
        get('matrix').append(option);
    }
    const params = new URL(location.href).searchParams;
    let region = regions.includes(params.get('region')) ? params.get('region') : '';
    if (params.get('status') === 'approved') get('status').value = 'approved';
    get('total').textContent = data.length;
    get('approved').textContent = data.filter(row => row.approved).length;
    get('coverage').textContent = regions.length;
    const selectors = new Map();
    const regionAliases = {
        Europe: ['Europe', 'Europe & UK'],
        Americas: ['Americas', 'North America', 'LATAM'],
        APAC: ['APAC', 'Southeast Asia', 'Oceania'],
        GCC: ['GCC', 'GCC / MENA', 'MENA', 'Middle East']
    };
    const matchesRegion = (row, label) => row.regions.some(name => (regionAliases[label] || [label]).includes(name));
    for (const name of ['', ...regions]) {
        const button = node('button', name || 'All regions');
        button.type = 'button';
        button.onclick = () => { region = name; render(); };
        get('regions').append(button);
        selectors.set(name, button);
    }
    function render() {
        const matrix = get('matrix').value, status = get('status').value;
        const query = get('search').value.trim().toLowerCase();
        const filtered = data.filter(row =>
            (!region || matchesRegion(row, region)) &&
            (!matrix || row.sets.includes(matrix)) &&
            (!status || row.approved === (status === 'approved')) &&
            [row.name, row.category, row.summary, ...row.regions].join(' ').toLowerCase().includes(query));
        for (const [name, button] of selectors) button.setAttribute('aria-pressed', String(name === region));
        get('summary').textContent = filtered.length + ' sources · ' + (region || 'All regions');
        const centralBankRegions = {'Europe & UK':'Europe',Europe:'Europe',Americas:'Americas','North America':'Americas',LATAM:'Americas',APAC:'Asia-Pacific',Oceania:'Asia-Pacific','Southeast Asia':'Asia-Pacific',GCC:'Middle East','GCC / MENA':'Middle East',MENA:'Middle East','Middle East':'Middle East',Africa:'Africa'};
        const bankRegion = centralBankRegions[region];
        get('centralBanks').href = '/pages/risk/global-central-banks.html' + (bankRegion ? '?region=' + encodeURIComponent(bankRegion) : '');
        const sections = new Map();
        for (const row of filtered) {
            const label = region || row.regions[0] || 'Global';
            if (!sections.has(label)) sections.set(label, []);
            sections.get(label).push(row);
        }
        get('cards').replaceChildren(...[...sections].sort(([a],[b])=>a.localeCompare(b)).map(([label,rows])=>{
            const section=node('section','');
            const heading=node('h3',label+' · '+rows.length);
            const grid=node('div',''); grid.className='region-grid';
            section.append(heading,grid);
            grid.append(...rows.map(renderCard));
            return section;
        }));
    }
    function renderCard(row) {
            const card = node('article', '');
            const tag = node('span', row.approved ? 'Registry-approved' : row.category === 'Validation reference' ? 'Validation reference' : 'Candidate');
            tag.className = 'tag' + (row.approved ? ' approved' : '');
            card.append(tag, node('h3', row.name), node('p', row.regions.join(' · ') + ' — ' + row.category), node('p', row.summary));
            const links = node('nav', '');
            links.setAttribute('aria-label', row.name + ' source links');
            for (const [text, url] of [['Official website', row.site], ['Announcement target', row.target]]) {
                if (!url || (text === 'Announcement target' && url === row.site)) continue;
                const anchor = link(text, url);
                if (anchor) links.append(anchor);
            }
            if (links.childNodes.length) card.append(links);
            return card;
    }
    get('search').oninput = render;
    get('status').onchange = get('matrix').onchange = render;
    render();
}
start().catch(() => { get('summary').textContent = 'The source network is temporarily unavailable.'; });

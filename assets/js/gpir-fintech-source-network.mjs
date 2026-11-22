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
async function load() {
    const config = window.GPIR_SUPABASE_PUBLIC_CONFIG;
    if (!config?.url || !config.publishableKey) throw Error('Directory configuration unavailable');
    const session = await window.GPIRReaderAuth?.sessionReady;
    const headers = new Headers();
    headers.set('apikey', config.publishableKey);
    if (session?.access_token) headers.set('Authorization', 'Bearer ' + session.access_token);
    fetch(config.url + '/functions/v1/gpir-public-alerts').then(response => {
        if (!response.ok) throw Error('Alerts unavailable');
        return response.json();
    }).then(data => {
        const count = Array.isArray(data.alerts) ? data.alerts.length : 0;
        get('alertState').textContent = count ? count + ' verified live alerts' : 'No verified alerts in the last 12 hours';
    }).catch(() => { get('alertState').textContent = 'Live alerts temporarily unavailable'; });
    const [response, maps] = await Promise.all([
        fetch(config.url + '/functions/v1/gpir-source-directory?catalog=fintech',{headers,cache:'no-store'}),
        fetch('/assets/data/gpir-central-bank-map-outlines.json').then(r => r.ok ? r.json() : {}).catch(() => ({}))
    ]);
    if (!response.ok) throw Error('Source network unavailable');
    const {cards,access,totals} = await response.json();
    if (!Array.isArray(cards) || !totals) throw Error('Invalid source network response');
    const full = access === 'ALLOW';
    get('approved').textContent = totals.approved;
    get('total').textContent = totals.sources;
    get('categories').textContent = totals.categories;
    get('coverage').textContent = totals.regions;
    get('access').textContent = full ? 'Full directory' : 'Public preview';
    get('unlock').hidden = full;
    const unlock = get('unlockLink');
    if (access === 'UNAUTHENTICATED') unlock.href = '/reader/sign-in/?returnTo=' + encodeURIComponent(location.pathname + location.search);
    else { unlock.href = '/reader/my-gpir/#plan'; unlock.textContent = 'View subscription options'; }
    const params = new URL(location.href).searchParams;
    const groups = [...new Set(cards.flatMap(row => row.regions.map(groupOf)))];
    const regions = [...new Set([...Object.keys(palette), ...groups])];
    const matrices = [...new Set(cards.flatMap(row => row.sets))].sort();
    function option(select,text,value) { const element = node('option',text); element.value = value; select.append(element); }
    option(get('region'),'All regions','');
    for (const region of regions) option(get('region'),region,region);
    for (const matrix of matrices) option(get('matrix'),matrix,matrix);
    const initial = groupOf(params.get('region'));
    if (regions.includes(initial)) get('region').value = initial;
    if (params.get('status') === 'approved') get('status').value = 'approved';

    function pick(region) { get('region').value = region; render(); }
    function mapPanel() {
        const panel = node('section',''); panel.className = 'map-panel';
        panel.append(node('strong','Source network by region'));
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns,'svg');
        svg.setAttribute('viewBox','0 0 230 128');
        svg.setAttribute('aria-label','Select a region on the map');
        const shapes = [
            ['North America','Americas',4,6,.7,'0 0 100 35'],['LATAM','Americas',36,56,.82,'0 34 100 36'],
            ['Europe & UK','Europe',84,9,.61],['Africa','Africa',91,45,.66],
            ['GCC','Middle East',121,45,.45],['APAC','Asia-Pacific',151,18,.76],['Oceania','Asia-Pacific',170,79,.65,'0 37 100 33']
        ];
        for (const [name,key,x,y,scale,viewBox] of shapes) {
            const outline = maps.region?.[key];
            if (!outline) continue;
            const a = document.createElementNS(ns,'a'); a.setAttribute('href',route+'?region='+encodeURIComponent(name)); a.setAttribute('aria-label',name);
            a.addEventListener('click',event=>{event.preventDefault();pick(name);});
            const inset = document.createElementNS(ns,'svg');
            for (const [attribute,value] of Object.entries({x,y,width:100*scale,height:70*scale,viewBox:viewBox||'0 0 100 70'})) inset.setAttribute(attribute,value);
            const path = document.createElementNS(ns,'path');
            path.setAttribute('d',outline);path.setAttribute('fill',palette[name][0]);
            const title = document.createElementNS(ns,'title');title.textContent=name;
            inset.append(title,path);a.append(inset);svg.append(a);
        }
        if (svg.childNodes.length) panel.append(svg);
        const links=node('nav','');links.setAttribute('aria-label','Map regions');
        for (const name of regions) {
            const a=node('a',name);a.href=route+'?region='+encodeURIComponent(name);
            a.onclick=event=>{event.preventDefault();pick(name);};links.append(a);
        }
        panel.append(links);
        return panel;
    }
    function renderCard(row) {
        const card=node('article','');
        const status=node('span',row.approved?'Registry-approved':row.category==='Validation reference'?'Validation reference':'Candidate');
        status.className='tag'+(row.approved?' approved':'');
        card.append(status,node('h4',row.name),node('p',row.category));
        if (full) {
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
    function render() {
        const region=get('region').value, matrix=get('matrix').value, status=get('status').value;
        const query=get('search').value.trim().toLowerCase();
        const matched=cards.filter(row=>(!region||row.regions.map(groupOf).includes(region))
            &&(!matrix||row.sets.includes(matrix))&&(!status||row.approved===(status==='approved'))
            &&[row.name,row.category,full?row.summary:'',...row.regions].join(' ').toLowerCase().includes(query));
        get('summary').textContent=matched.length+' '+(full?'sources':'preview sources')+' · '+(region||'All regions');
        const panels=new Map();
        for(const row of matched){
            const label=region||groupOf(row.regions[0])||'Global';
            if(!panels.has(label))panels.set(label,[]);
            panels.get(label).push(row);
        }
        const root=get('cards');root.replaceChildren();
        if(!region)root.append(mapPanel());
        for(const [name,rows] of panels){
            const panel=node('section','');panel.className='region-panel';
            const [color,tint]=palette[name]||palette.Global;
            panel.style.setProperty('--region',color);panel.style.setProperty('--tint',tint);
            const title=node('h3',name+' · '+rows.length);
            const grid=node('div','');grid.className='region-grid';grid.append(...rows.map(renderCard));
            panel.append(title,grid);root.append(panel);
        }
        if(!matched.length)root.append(node('p','No sources match these filters.'));
    }
    get('search').oninput=render;
    get('region').onchange=get('status').onchange=get('matrix').onchange=render;
    render();
}
load().catch(()=>{get('summary').textContent='The source network is temporarily unavailable.';get('access').textContent='Unavailable';});

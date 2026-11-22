
async function loadDirectory(){
 const config=window.GPIR_SUPABASE_PUBLIC_CONFIG;
 if(!config?.url||!config.publishableKey)throw Error('Directory configuration unavailable');
 const session=await window.GPIRReaderAuth?.sessionReady;
 const headers=new Headers();
 headers.set('apikey',config.publishableKey);
 if(session?.access_token)headers.set('Authorization','Bearer '+session.access_token);
 const response=await fetch(config.url+'/functions/v1/gpir-source-directory',{headers,cache:'no-store'});
 if(!response.ok)throw Error('Directory unavailable');
 const result=await response.json();
 if(!Array.isArray(result.cards)||!['ALLOW','DENY','UNAUTHENTICATED'].includes(result.access))throw Error('Invalid directory response');
 return result;
}
async function initialize(){
 const [directory,maps]=await Promise.all([loadDirectory(),fetch('/assets/data/gpir-central-bank-map-outlines.json')]);
 const outlines=maps.ok?await maps.json():{country:{},region:{}};
 const access=directory.access;

const mapColors={'Europe':'#325baf','Americas':'#147f6a','Asia-Pacific':'#8651ad','Middle East':'#137a86','Africa':'#ae651e'};
function addMap(node,shape){
 if(!shape)return;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 const path=document.createElementNS('http://www.w3.org/2000/svg','path');
 svg.setAttribute('viewBox','0 0 100 70');svg.setAttribute('aria-hidden','true');
 svg.setAttribute('class','map-watermark');path.setAttribute('d',shape);svg.append(path);node.prepend(svg);
}
function regionFor(record){return [...groups.keys()].slice(1).find(key=>inGroup(record,key));}
function countryMap(node,record){node.style.setProperty('--map-color',mapColors[regionFor(record)]||'#325baf');addMap(node,outlines.country[record.code]);}
const source=directory.cards;
const groups=new Map([
 ['All',[]],['Europe',['Europe/SEPA','UK','CIS']],['Americas',['North America & Canada','LATAM']],
 ['Asia-Pacific',['APAC','ASEAN','Far East','South Asia','Oceania']],['Middle East',['GCC']],['Africa',['Africa']]
]);
const abbreviations={AU:'RBA',BD:'BB',CA:'BoC',CN:'PBOC',EU:'ECB',GB:'BoE',HK:'HKMA',ID:'BI',IN:'RBI',JP:'BOJ',MY:'BNM',NZ:'RBNZ',PH:'BSP',SG:'MAS',TH:'BOT',US:'Fed'};
const collator=new Intl.Collator('en',{numeric:true,sensitivity:'base'});
const get=id=>document.getElementById(id);
const authorityRows=new Map();
for(const item of source){
 const {region,kind,name}=item;
 const code=item.country_code||'',country=item.country||'',scope=item.coverage||'';
 let url='',host='';
 if(access==='ALLOW'&&item.official_url){
  try{const parsed=new URL(item.official_url);if(parsed.protocol==='https:'&&!parsed.username&&!parsed.password){url=parsed.href;host=parsed.hostname;}}catch{}
 }
 const key=kind+'|'+code+'|'+name;
 if(authorityRows.has(key)){authorityRows.get(key).regions.add(region);continue;}
 const abbr=kind==='bank'?(name.match(/\(([A-Z][A-Z0-9–-]{1,9})\)/)?.[1]||abbreviations[code]||''):'';
 authorityRows.set(key,{kind,code,country,name,url,scope,abbr,host,regions:new Set([region])});
}
const all=[...authorityRows.values()];
const regionNames=[...new Set(source.map(r=>r.region))].sort(collator.compare);
const countCountries=records=>new Set(records.filter(r=>r.code).map(r=>r.code)).size;
get('total').textContent=access==='ALLOW'?countCountries(all.filter(r=>r.kind==='bank')):'—';
get('regionTotal').textContent=groups.size-1;
get('directoryStatus').textContent=access==='ALLOW'?'Full directory':'Public preview';
let group='All',region='',sort='country',direction=1,view='cards';
const featured=['EU','US','IN','GB','SG','AE'];
const initial=new URL(location.href).searchParams.get('region');
if(groups.has(initial))group=initial;
else if(regionNames.includes(initial)){region=initial;group=[...groups].find(([,names])=>names.includes(initial))?.[0]||'All';}
function setView(value){view=value;get('cardsView').setAttribute('aria-pressed',value==='cards');get('listView').setAttribute('aria-pressed',value==='list');render();}
get('cardsView').onclick=()=>setView('cards');get('listView').onclick=()=>setView('list');
for(const key of [...groups.keys()].slice(1)){
 const a=el('a',key);a.href='?region='+encodeURIComponent(key);a.style.setProperty('--map-color',mapColors[key]);addMap(a,outlines.region[key]);a.onclick=event=>{event.preventDefault();group=key;region='';get('search').value='';render();get('pills').scrollIntoView({block:'nearest'});};get('footerRegions').append(a);
}
let selected=null, opener=null;
const referenceLinks=new Map([['ECB','https://www.ecb.europa.eu/'],['BIS','https://www.bis.org/'],['World Bank','https://www.worldbank.org/'],['FATF','https://www.fatf-gafi.org/'],['OFAC','https://ofac.treasury.gov/']]);
const regionalStyles=['reg-europe','reg-americas','reg-asia','reg-mea','reg-africa'];
function regionBadge(record){
 const index=[...groups.keys()].slice(1).findIndex(key=>inGroup(record,key));
 return chip([...groups.keys()][index+1]||'Other',regionalStyles[index]||'scope-authority');
}
function scopeBadge(record){
 if(/payment|clearing|settlement|\bRTGS\b|\bACH\b|instant|remittance/i.test(record.scope))return chip('Payments', 'scope-payment');
 if(/regulat|licens|oversight|supervis/i.test(record.scope))return chip('Regulation', 'scope-regulation');
 return chip('Monetary authority', 'scope-authority');
}
function chip(label,style){const span=el('span',label);span.className='pill '+style;return span;}
function external(label,url){const link=el('a',label);link.href=url;link.target='_blank';link.rel='noopener noreferrer';return link;}
function appendField(body,label,...content){const section=el('section','');section.append(el('h3',label),...content);body.append(section);}
function renderInspector(){
 if(!selected)return;
 const r=selected,body=get('inspectorBody'),isLocked=locked();
 get('inspectorTitle').textContent=(r.country||r.name)+(r.abbr&&!isLocked?' · '+r.abbr:'');
 body.replaceChildren();
 const summary=el('div','');summary.className='country-summary';countryMap(summary,r);
 summary.append(el('p',r.country),el('strong',r.name));body.append(summary);
 appendField(body,'Official monetary authority',el('p',r.name));
 appendField(body,'Directory regions',regionBadge(r),...[...r.regions].map(name=>chip(name,'scope-authority')));
 if(isLocked){
  const unlock=external('Unlock full directory',get('unlockLink').href);unlock.className='official';
  appendField(body,'Full directory access',el('p',get('unlockText').textContent),unlock);return;
 }
 appendField(body,'Regulatory and payments scope',scopeBadge(r),el('p',r.scope||'Scope details unavailable in the source record.'));
 const refs=el('div','');refs.className='references';
 for(const [name,url] of referenceLinks)refs.append(external(name,url));
 const note=el('p','GPIR-wide reference institutions. This record does not include individual verification citations.');note.className='note';
 appendField(body,'GPIR reference institutions',refs,note);
 const portal=external('Open official website ↗',r.url);portal.className='official';
 if(r.url)appendField(body,'Official institutional portal',portal);
}
function openInspector(record,button){selected=record;opener=button;renderInspector();get('inspector').showModal();get('closeInspector').focus();}
get('closeInspector').onclick=()=>get('inspector').close();
get('inspector').addEventListener('click',event=>{if(event.target===get('inspector')&&(event.clientX<get('inspector').getBoundingClientRect().left))get('inspector').close();});
get('inspector').addEventListener('close',()=>{opener?.focus();selected=null;opener=null;});
const locked=()=>access!=='ALLOW';
const inGroup=(item,key)=>key==='All'||groups.get(key).some(r=>item.regions.has(r));
function el(tag,text){const node=document.createElement(tag);node.textContent=text;return node;}
function filterButton(container,label,count,active,action){
 const button=el('button',label);button.type='button';button.setAttribute('aria-pressed',active);if(outlines.region[label]){button.style.setProperty('--map-color',mapColors[label]);addMap(button,outlines.region[label]);}
 const number=el('span',count);number.className='n';number.setAttribute('aria-label',count+' jurisdictions');button.append(number);
 button.onclick=()=>{action();render();[...container.children].find(b=>b.getAttribute('aria-pressed')==='true')?.focus();};container.append(button);
}
function render(){
 const isLocked=locked(),mode=access==='UNAUTHENTICATED'?'Signed out':'No active subscription',query=get('search').value.trim().toLowerCase();
 if(isLocked&&['abbr','scope','host'].includes(sort)){sort='country';direction=1;}
 const searched=all.filter(r=>r.kind===get('sourceType').value&&[r.country,r.name,r.code,...(isLocked?[]:[r.abbr])].join(' ').toLowerCase().includes(query));
 const matched=searched.filter(r=>inGroup(r,group));
 const shown=matched.filter(r=>!region||r.regions.has(region)).sort((a,b)=>direction*collator.compare(a[sort],b[sort])||collator.compare(a.name,b.name));
 const pills=get('pills');pills.replaceChildren();
 for(const key of groups.keys())filterButton(pills,key,isLocked?searched.filter(r=>inGroup(r,key)).length:countCountries(searched.filter(r=>inGroup(r,key))),key===group,()=>{group=key;region='';});

 get('resultsTitle').textContent=region|| (group==='All'?'All jurisdictions':group);
 const n=countCountries(shown);get('resultCount').textContent=(isLocked?'Public preview · ':n+' '+(n===1?'jurisdiction':'jurisdictions')+' · ')+shown.length+' '+(shown.length===1?'entry':'entries');
 get('unlock').hidden=!isLocked;
 get('unlockText').textContent=mode==='Signed out'?'Sign in or create a GPIR account, then activate a subscription to view full details.':'Activate your GPIR subscription to view regulatory details and official portals.';
 get('unlockLink').href=mode==='Signed out'?'https://fintechoisis.com/reader/sign-in/?returnTo=%2Fpages%2Frisk%2Fglobal-central-banks.html':'https://fintechoisis.com/reader/plan/';
 for(const b of document.querySelectorAll('th button')){
  const column=b.dataset.sort, active=column===sort;
  b.disabled=isLocked&&['abbr','scope','host'].includes(column);
  const th=b.closest('th'); th.removeAttribute('aria-sort');if(active)th.setAttribute('aria-sort',direction===1?'ascending':'descending');
  b.querySelector('span').textContent=active?(direction===1?' ↑':' ↓'):(b.disabled?'':' ↕');
 }
 const body=get('rows');body.replaceChildren();
 const grid=get('cardGrid');grid.replaceChildren();grid.hidden=view!=='cards';get('tableView').hidden=view!=='list';
 if(view==='cards'){
  if(!shown.length)grid.append(el('p','No matching authorities.'));
  const preferred=code=>featured.includes(code)?featured.indexOf(code):featured.length;
  if(group==='All'&&!query)shown.sort((a,b)=>preferred(a.code)-preferred(b.code));
  for(const r of shown){
   const card=el('article','');card.className='authority-card '+regionBadge(r).className.split(' ').at(-1);
   const upper=el('div','');upper.className='authority-upper';
   const identity=el('div','');identity.className='authority-flag';
   const flag=el('span',/^[A-Z]{2}$/.test(r.code)?[...r.code].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join(''):'');
   flag.className='flag-large';flag.setAttribute('aria-hidden','true');identity.append(flag,el('strong',r.code));
   const description=el('div','');description.className='authority-copy';
   description.append(el('h3',r.country||r.name),el('p',r.country?r.name+(r.abbr&&!isLocked?' ('+r.abbr+')':''):regionFor(r)||''));
   const detail=el('span',isLocked?'Subscription required':r.scope||'Monetary authority');detail.className='scope-line';description.append(detail);
   upper.append(identity,description);
   const b=el('button','View Authority Profile');b.type='button';b.className='profile-action';b.setAttribute('aria-haspopup','dialog');b.onclick=()=>openInspector(r,b);
   card.append(upper,b);countryMap(card,r);grid.append(card);
  }
  return;
 }
 if(!shown.length){const row=el('tr',''),cell=el('td','No jurisdictions or authorities match this search.');cell.colSpan=5;row.append(cell);body.append(row);return;}
 for(const r of shown){
  const row=el('tr',''),flag=el('span',/^[A-Z]{2}$/.test(r.code)?[...r.code].map(c=>String.fromCodePoint(127397+c.charCodeAt(0))).join(''):'');
  flag.className='flag';flag.setAttribute('aria-hidden','true');const country=el('td',''),countryContent=el('div','');countryContent.className='countrycell';
  countryContent.append(flag,el('span',r.country),regionBadge(r));country.append(countryContent);
  const authority=el('td',''),button=el('button',r.name);button.type='button';button.className='authority-button';button.setAttribute('aria-haspopup','dialog');authority.append(button);
  button.onclick=()=>openInspector(r,button);
  row.onclick=event=>{if(!event.target.closest('a,button'))openInspector(r,button);};
  const scope=el('td',isLocked?'Subscription required':'');scope.className=isLocked?'locked':'scope';
  if(!isLocked){const summary=el('div',r.scope||'—');summary.className='scope-preview';scope.append(scopeBadge(r),summary);}
  const portal=el('td','');
  if(isLocked){portal.textContent='Locked';portal.className='locked';}
  else if(r.url){const a=external('Official portal ↗',r.url);a.className='official';a.setAttribute('aria-label','Official portal for '+r.name);portal.append(a);}
  row.append(country,authority,el('td',isLocked?'—':r.abbr||'—'),scope,portal);body.append(row);
 }
}
for(const b of document.querySelectorAll('th button'))b.onclick=()=>{const key=b.dataset.sort;direction=sort===key?-direction:1;sort=key;render();};
get('sourceType').onchange=render;get('search').oninput=render;render();

}
initialize().catch(()=>{
 document.getElementById('directoryStatus').textContent='Unavailable';
 document.getElementById('resultCount').textContent='The source directory is temporarily unavailable.';
});

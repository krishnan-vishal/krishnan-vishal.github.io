#!/usr/bin/env node
// Recovery reconstruction: middle aggregation block was missing from pasted Codex output.
// Verify workbook sheet and column mapping before any production ingestion.
import {createReadStream,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const RPW_CATALOG_URL='https://datacatalog.worldbank.org/search/dataset/0037898/remittance-prices-worldwide';
const RPW_RESOURCE_URL='https://datacatalogfiles.worldbank.org/ddh-published/0037898/DR0095523/rpw_dataset_2011_2025_q3.xlsx';
const RPW_TERMS_URL='https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets';
function decodeXml(s=''){return s.replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&quot;','"').replaceAll('&apos;',"'").replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))}
export function loadSharedStrings(filename){const xml=readFileSync(filename,'utf8');return [...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>decodeXml([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(x=>x[1]).join('')))}
export function decodeRow(xml,strings){const row={};for(const m of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){const ref=m[1].match(/\br="([A-Z]+\d+)"/)?.[1];if(!ref)continue;const type=m[1].match(/\bt="([^"]+)"/)?.[1];const raw=m[2].match(/<v>([\s\S]*?)<\/v>/)?.[1]??m[2].match(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/)?.[1]??'';row[ref.match(/^[A-Z]+/)[0]]=type==='s'?(strings[+raw]??''):decodeXml(raw)}return row}
export async function streamRows(filename,onRow){const input=createReadStream(filename,{encoding:'utf8',highWaterMark:1048576});let buffer='',inData=false;for await(const chunk of input){buffer+=chunk;if(!inData){const i=buffer.indexOf('<sheetData>');if(i<0){buffer=buffer.slice(-64);continue}buffer=buffer.slice(i+11);inData=true}while(true){const a=buffer.indexOf('<row'),b=buffer.indexOf('</row>',a);if(a<0||b<0)break;const xml=buffer.slice(a,b+6);buffer=buffer.slice(b+6);if(await onRow(xml)===false){input.destroy();return}}if(buffer.includes('</sheetData>'))return}}
function periodKey(s){const m=String(s||'').match(/^(\d{4})_([1-4])Q$/);return m?`${m[1]}-Q${m[2]}`:null}
function quarterEnd(s){const m=s.match(/^(\d{4})-Q([1-4])$/);return m?new Date(Date.UTC(+m[1],+m[2]*3,0)).toISOString().slice(0,10):null}
const round=n=>Math.round(n*10000)/10000;
const median=a=>{const x=[...a].sort((p,q)=>p-q),i=Math.floor(x.length/2);return x.length%2?x[i]:(x[i-1]+x[i])/2};
function normalizeHeaders(row){return Object.fromEntries(Object.entries(row).map(([k,v])=>[String(v).trim().toLowerCase(),k]))}
function normalizeRow(row,headers){return Object.fromEntries(Object.entries(headers).map(([name,col])=>[name,row[col]??'']))}
export function resolveDatasetSheets(root){
 const workbook=readFileSync(resolve(root,'xl/workbook.xml'),'utf8'),relationships=readFileSync(resolve(root,'xl/_rels/workbook.xml.rels'),'utf8');
 const sheets=[...workbook.matchAll(/<sheet\b([^>]*?)\/?\s*>/g)];
 return ['Dataset (up to Q1 2016)','Dataset (from Q2 2016)'].map(name=>{
    const attributes=sheets.find(match=>match[1].match(/\bname="([^"]+)"/)?.[1]===name)?.[1];
    const id=attributes?.match(/\br:id="([^"]+)"/)?.[1];
    const relationship=[...relationships.matchAll(/<Relationship\b([^>]*?)\/?\s*>/g)].find(match=>match[1].match(/\bId="([^"]+)"/)?.[1]===id)?.[1];
    const target=relationship?.match(/\bTarget="([^"]+)"/)?.[1];
    if(!id||!/^worksheets\/sheet\d+\.xml$/.test(target||''))throw Error('RPW_DATASET_SHEET_MISSING');
    return resolve(root,'xl',target);
 });
}
export async function aggregateRpwCorridors({sheet,sheets=sheet?[sheet]:[],sharedStrings,startPeriod,endPeriod}){
 if(!Array.isArray(sheets)||!sheets.length||!/^\d{4}-Q[1-4]$/.test(startPeriod||'')||!/^\d{4}-Q[1-4]$/.test(endPeriod||'')||startPeriod>endPeriod)throw Error('RPW_INVALID_PERIOD_WINDOW');
 const groups=new Map(),seenQuotes=new Map();let rowsScanned=0,rowsSelected=0,rejected=0,duplicates=0;
 for(const dataset of sheets){let headers=null;
 await streamRows(dataset,xml=>{
  const cells=decodeRow(xml,sharedStrings);
    if(!headers){headers=normalizeHeaders(cells);if(!['id','period','source_code','source_name','destination_code','destination_name','firm','cc1 denomination amount','cc1 total cost %'].every(name=>headers[name]))throw Error('RPW_REQUIRED_HEADERS_MISSING');return true}
  rowsScanned++;const row=normalizeRow(cells,headers);
  const period=periodKey(row.period||row.quarter||row['survey period']);
  if(!period||period<startPeriod||period>endPeriod)return true;
    const rawCost=String(row['cc1 total cost %']).trim(),denomination=String(row['cc1 denomination amount']).trim(),cost=Number(rawCost);
    if(!row.id||!row.source_code||!row.destination_code||!row.source_name||!row.destination_name||!rawCost||!denomination||Number(denomination)!==200||!Number.isFinite(cost)||cost<0){rejected++;return true}
    const quoteKey=JSON.stringify([period,row.id]),quoteSignature=JSON.stringify(row);
    if(seenQuotes.has(quoteKey)){if(seenQuotes.get(quoteKey)!==quoteSignature)throw Error('RPW_CONFLICTING_QUOTE_ID');duplicates++;return true}
    seenQuotes.set(quoteKey,quoteSignature);
  rowsSelected++;
  const key=`${period}|${row.source_code}|${row.destination_code}`;
  const group=groups.get(key)??{period,sourceCode:row.source_code,sourceName:row.source_name,destinationCode:row.destination_code,destinationName:row.destination_name,sourceRegion:row.source_region,destinationRegion:row.destination_region,sendCurrencies:new Set(),firms:new Set(),costs:[],dates:new Set()};
  if(row['cc1 lcu code'])group.sendCurrencies.add(row['cc1 lcu code']);
  if(row.firm)group.firms.add(row.firm);
  if(row.date)group.dates.add(row.date);
  group.costs.push(cost);groups.set(key,group);return true;
 });
 if(!headers)throw Error('RPW_EMPTY_DATASET_SHEET');
 }
 const records=[...groups.values()].map(group=>{
  const observationDate=quarterEnd(group.period),average=round(group.costs.reduce((a,b)=>a+b,0)/group.costs.length),midpoint=round(median(group.costs));
  const identity=JSON.stringify(['WORLD_BANK_RPW',group.period,group.sourceCode,group.destinationCode,'cc1_total_cost_percent']);
  return {
   source_id:'WORLD-BANK-RPW-001',discovered_url:RPW_RESOURCE_URL,canonical_url:RPW_CATALOG_URL,
   raw_title:`RPW ${group.sourceName} → ${group.destinationName} — ${group.period} average $200 transfer cost`,
    raw_content:JSON.stringify({period:group.period,observation_date:observationDate,observation_date_basis:'quarter_end_not_survey_date',sending_country:{code:group.sourceCode,name:group.sourceName,region:group.sourceRegion},receiving_country:{code:group.destinationCode,name:group.destinationName,region:group.destinationRegion},metric:'cc1_total_cost_percent',denomination_usd:200,aggregation:'unweighted_mean_of_surveyed_service_quotes',average_total_cost_percent:average,median_total_cost_percent:midpoint,minimum_total_cost_percent:round(Math.min(...group.costs)),maximum_total_cost_percent:round(Math.max(...group.costs)),quote_count:group.costs.length,firm_count:group.firms.size,sending_currencies:[...group.sendCurrencies].sort()}),
  discovered_at:new Date().toISOString(),source_published_at:null,http_status:null,content_hash:createHash('sha256').update(identity).digest('hex'),ingestion_status:'PROCESSED',rejection_reason:null,
   metadata:{engine:'M39-GATE2-RPW-V1',parser_profile:'world-bank-rpw-xlsx-v1',acquisition_method:'A',provider:'WORLD_BANK_RPW',data_class:'STATISTICAL_REFERENCE',record_type:'RPW_CORRIDOR_QUARTER',topic:'Remittances & Diaspora',observation_period:group.period,observation_date:observationDate,sending_country_code:group.sourceCode,sending_country:group.sourceName,receiving_country_code:group.destinationCode,receiving_country:group.destinationName,source_region:group.sourceRegion,destination_region:group.destinationRegion,sending_currencies:[...group.sendCurrencies].sort(),metric:'cc1_total_cost_percent',value:average,median_value:midpoint,quote_count:group.costs.length,firm_count:group.firms.size,source_url:RPW_RESOURCE_URL,catalog_url:RPW_CATALOG_URL,terms_url:RPW_TERMS_URL,attribution:'The World Bank, Remittance Prices Worldwide',official_fx_rate:false,settlement_telemetry:false,publication_eligible:false,alert_eligible:false}
  }
 }).sort((a,b)=>a.metadata.observation_period.localeCompare(b.metadata.observation_period)||a.metadata.sending_country_code.localeCompare(b.metadata.sending_country_code)||a.metadata.receiving_country_code.localeCompare(b.metadata.receiving_country_code));
 return {records,statistics:{rows_scanned:rowsScanned,rows_selected:rowsSelected,rows_duplicate:duplicates,records_aggregated:records.length,records_rejected:rejected}};
}
async function main(){const args=process.argv.slice(2),root=args[0];if(!root)throw Error('Usage: rpw-xlsx-quarterly.mjs <extracted-xlsx-root> [--aggregate --start YYYY-Qn --end YYYY-Qn]');const strings=loadSharedStrings(resolve(root,'xl/sharedStrings.xml')),sheets=resolveDatasetSheets(root);if(args.includes('--aggregate')){const option=(key,defaultValue)=>args.includes(key)?args[args.indexOf(key)+1]:defaultValue,start=option('--start','2011-Q1'),end=option('--end','2025-Q3');const result=await aggregateRpwCorridors({sheets,sharedStrings:strings,startPeriod:start,endPeriod:end}),output=JSON.stringify(result)+'\n',out=option('--out',null);if(out)writeFileSync(resolve(out),output);else process.stdout.write(output);return}const n=Number(args.includes('--rows')?args[args.indexOf('--rows')+1]:1),rows=[];await streamRows(sheets[1],x=>{rows.push(decodeRow(x,strings));return rows.length<n});process.stdout.write(JSON.stringify(n===1?rows[0]:rows,null,2)+'\n')}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(e=>{console.error(e);process.exitCode=1});

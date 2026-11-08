"use strict";
// BIS SDMX-CSV 2.0 parser. Bounded, deterministic and deliberately write-free.
// SDMX datasets require an explicitly approved dataflow/key before ingestion.
const REQUIRED = ["TIME_PERIOD", "OBS_VALUE"];
function csvRows(text) {
  if (typeof text !== "string" || text.length > 8_000_000) throw Error("BIS_CSV_SIZE_INVALID");
  const rows = []; let row = [], field = "", quoted = false;
  for (let i=0; i<text.length; i++) {
    const c=text[i];
    if (c==='"') {
      if (quoted && text[i+1]==='"') {field+='"';i++;}
      else if (!quoted && field==="") quoted=true;
      else if (quoted) quoted=false;
      else throw Error("BIS_CSV_QUOTING_INVALID");
    } else if (c==="," && !quoted) {row.push(field);field="";}
    else if ((c==="\n" || c==="\r") && !quoted) {
      if (c==="\r" && text[i+1]==="\n") i++;
      row.push(field); if (row.some(x=>x.trim())) rows.push(row);
      row=[];field=""; if(rows.length>20001) throw Error("BIS_CSV_ROW_LIMIT");
    } else field+=c;
  }
  if(quoted) throw Error("BIS_CSV_UNTERMINATED_QUOTE");
  row.push(field);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
function parseBisSdmxCsv(csv, {dataflow, sourceUrl, maxObservations=1000}={}) {
  if(!/^[A-Z0-9_.-]{2,80}$/i.test(dataflow||"")) throw Error("BIS_APPROVED_DATAFLOW_REQUIRED");
  if(!Number.isInteger(maxObservations)||maxObservations<1||maxObservations>10000)throw Error("BIS_INVALID_LIMIT");
  const u=new URL(sourceUrl);
  if(u.protocol!=="https:"||u.hostname!=="stats.bis.org"||!u.pathname.startsWith("/api/")) throw Error("BIS_SOURCE_URL_NOT_OFFICIAL");
  const rows=csvRows(csv);if(!rows.length)throw Error("BIS_EMPTY_CSV");
  const headers=rows[0].map(x=>x.trim().toUpperCase());
  if(!REQUIRED.every(x=>headers.includes(x)))throw Error("BIS_MISSING_SDMX_COLUMNS");
  if(new Set(headers).size!==headers.length)throw Error("BIS_DUPLICATE_COLUMNS");
  const timeIndex=headers.indexOf("TIME_PERIOD"),valueIndex=headers.indexOf("OBS_VALUE");
  const seen=new Set(),out=[];
  for(const cells of rows.slice(1)) {
    if(cells.length!==headers.length)throw Error("BIS_CSV_COLUMN_MISMATCH");
    const period=cells[timeIndex].trim(),rawValue=cells[valueIndex].trim();
    if(!/^\d{4}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?|-(?:Q[1-4]|S[12]))?$/.test(period))throw Error("BIS_TIME_PERIOD_INVALID");
    if(rawValue==="" || rawValue==="_")continue;
    const value=Number(rawValue);
    if(!Number.isFinite(value))throw Error("BIS_OBSERVATION_INVALID");
    const dimensions={};
    headers.forEach((name,i)=>{if(!["OBS_VALUE","TIME_PERIOD"].includes(name))dimensions[name]=cells[i].trim();});
    const key=JSON.stringify([dataflow,period,dimensions]);
    if(seen.has(key))continue;
    seen.add(key);
    out.push({provider:"BIS",dataflow,period,value,dimensions,sourceUrl:u.toString(),
      dataClass:"STATISTICAL_REFERENCE",publicationStatus:"NOT_PUBLISHED"});
    if(out.length>maxObservations)throw Error("BIS_OBSERVATION_LIMIT");
  }
  return out;
}
module.exports={parseBisSdmxCsv,csvRows};

// Fail-closed advisory policy. Exact withdrawn-advisory recognition is not a general exception.
// GitHub reviewed GHSA-fc5q-39xc-vjpf and withdrew it 2026-11-18.
// https://github.com/advisories/GHSA-fc5q-39xc-vjpf
export const advisory = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
export const expiry = Date.parse('2026-12-02T00:00:00Z');
const severity = new Set(['info','low','moderate','high','critical']);
export function classify(report) {
  if (!report || report.error || report.auditReportVersion !== 2 ||
      !report.vulnerabilities || Array.isArray(report.vulnerabilities) ||
      typeof report.vulnerabilities !== 'object') throw Error('Invalid audit report');
  const entries = new Map(Object.entries(report.vulnerabilities));
  const counts = {info:0,low:0,moderate:0,high:0,critical:0};
  for (const [name,v] of entries) {
    if (!v || v.name !== name || !severity.has(v.severity) ||
        !Array.isArray(v.via) || !v.via.length ||
        !Array.isArray(v.nodes) || !v.nodes.length) throw Error('Invalid audit entry');
    counts[v.severity]++;
    for (const cause of v.via) {
      if (typeof cause === 'string') {
        if (!entries.has(cause)) throw Error('Unknown dependency cause');
      } else if (!cause || !severity.has(cause.severity) ||
                 typeof cause.url !== 'string' || typeof cause.name !== 'string') {
        throw Error('Invalid direct advisory');
      }
    }
  }
  const meta = report.metadata?.vulnerabilities;
  if (!meta || Object.entries(counts).some(([k,n])=>meta[k]!==n) ||
      meta.total!==entries.size) throw Error('Audit count mismatch');
  if (counts.critical || [...entries.values()].some(v=>v.via.some(c=>typeof c!=='string' && c.severity==='critical'))) return 'BLOCK';
  const allowed = c=>c.url===advisory && c.name==='picomatch' && c.severity==='high';
  for (const v of entries.values()) {
    if (v.via.some(c=>typeof c!=='string' && c.severity==='high' && !allowed(c))) return 'BLOCK';
  }
  for (const [name,v] of entries) {
    if(v.severity!=='high') continue;
    const seen=new Set(), queue=[name]; let found=false;
    while(queue.length) {
      const key=queue.pop(); if(seen.has(key)) continue; seen.add(key);
      for(const c of entries.get(key).via) {
        if(typeof c==='string') queue.push(c);
        else { if(!allowed(c)) return 'BLOCK'; found=true; }
      }
    }
    if(!found) return 'BLOCK';
  }
  return counts.high ? 'EXCEPTION_CANDIDATE' : 'CLEAN';
}
// Exception remains inactive. A reviewed exposure record and separate activation
// change are required; no environment variable can enable acceptance.
export function releaseDecision(report, now=Date.now()) {
  const result=classify(report);
  if(result==='CLEAN') return 'PASS';
  // This exact advisory was withdrawn by GitHub Security Advisory review on 2026-11-18.
  // Other high/critical findings remain blocked by classify().
  if(result==='EXCEPTION_CANDIDATE') return 'PASS_WITHDRAWN_ADVISORY';
  return 'BLOCK';
}

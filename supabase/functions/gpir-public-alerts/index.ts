// GPIR M39 G1: read-only public alerts; no candidate promotion or writes.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const PROJECT_URL = Deno.env.get("SUPABASE_URL");
const SERVER_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigins = new Set([
 "https://fintechoisis.com",
 "https://codex-m39-g1-alerts-krishnan-vishal-github-io.krishnanvishal12.workers.dev"
]);
function cors(req: Request) {
 const requestOrigin=req.headers.get("Origin");
 const headers={ "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "content-type, apikey, authorization", "Vary": "Origin" };
 if(requestOrigin && allowedOrigins.has(requestOrigin)) return { ...headers, "Access-Control-Allow-Origin": requestOrigin };
 return headers;
}
function reply(req: Request, data: unknown, status=200) { return new Response(JSON.stringify(data), {status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=120",...cors(req)}}); }
function host(url: string) { try { const u=new URL(url); return u.protocol==="https:" && !u.username && !u.password ? u.hostname.toLowerCase() : null; } catch { return null; } }
function verifiedUrl(url: string, official: string) { const a=host(url),b=host(official); return Boolean(a && b && (a===b || a.endsWith("."+b)) && !a.includes("xn--")); }
Deno.serve(async req => {
 if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors(req)});
 if(req.method!=="GET") return reply(req,{error:"METHOD_NOT_ALLOWED"},405);
 if(!PROJECT_URL || !SERVER_KEY) return reply(req,{error:"FEED_UNAVAILABLE"},503);
 try {
  const now=Date.now(),since=new Date(now-12*3600000).toISOString();
  const params=new URLSearchParams({select:"id,source_id,title,summary_narration,canonical_url,published_at,topic_headers",publication_status:"eq.approved",ticker_eligible:"eq.true",published_at:"gte."+since,order:"published_at.desc",limit:"60"});
  const headers={apikey:SERVER_KEY,Authorization:"Bearer "+SERVER_KEY};
  const [itemsResponse,sourcesResponse]=await Promise.all([
   fetch(PROJECT_URL+"/rest/v1/global_announcements?"+params,{headers}),
   fetch(PROJECT_URL+"/rest/v1/source_registry?select=source_id,source_name,official_url,source_status",{headers})
  ]);
  if(!itemsResponse.ok || !sourcesResponse.ok) return reply(req,{error:"FEED_UNAVAILABLE"},503);
  const items=await itemsResponse.json(),sources=await sourcesResponse.json();
  const bySource=new Map(sources.filter((s:any)=>s.source_status==="GREEN").map((s:any)=>[s.source_id,s]));
  const alerts=items.filter((r:any)=>{
   const s:any=bySource.get(r.source_id);
   const t=Date.parse(r.published_at||"");
   return s && Number.isFinite(t) && t<=now && t>=now-12*3600000 &&
    typeof r.title==="string" && r.title.trim().length>=12 &&
    typeof r.summary_narration==="string" && r.summary_narration.trim().length>=40 &&
    typeof r.canonical_url==="string" && verifiedUrl(r.canonical_url,s.official_url);
  }).map((r:any)=>({id:r.id,title:r.title,summary:r.summary_narration,publishedAt:r.published_at,sourceUrl:r.canonical_url,sourceName:(bySource.get(r.source_id) as any).source_name,category:Array.isArray(r.topic_headers)?r.topic_headers[0]||"Payments":"Payments"}));
  return reply(req,{alerts,windowHours:12,generatedAt:new Date(now).toISOString()});
 } catch { return reply(req,{error:"FEED_UNAVAILABLE"},503); }
});

import { resolveSubscriberAccess } from "../_shared/gpir-reader-entitlement.mjs";

const origin = "https://fintechoisis.com";
const projectUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const qaReaderId = Deno.env.get("GPIR_SOURCE_DIRECTORY_QA_READER_ID");

Deno.serve(async (request) => {
    const headers = {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, apikey",
        "Cache-Control": "private, no-store",
        "Content-Type": "application/json"
    };
    const reply = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (request.method !== "GET") return reply({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (!projectUrl || !serviceKey) return reply({ error: "DIRECTORY_UNAVAILABLE" }, 503);

    try {
        const params = new URL(request.url).searchParams;
        const fintech = params.get('catalog') === 'fintech';
        const previewOnly = fintech && params.get('view') === 'preview';
        const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
        const access = token && !previewOnly
            ? await resolveSubscriberAccess({ supabaseUrl: projectUrl, serviceKey, accessToken: token, adminReaderId: Deno.env.get("GPIR_ADMIN_READER_ID"), ...(!fintech && { directoryQaReaderId: qaReaderId, directoryQaEmail: 'testxyz@fintechoisis.com' }) })
            : { decision: "UNAUTHENTICATED" };
        if (access.decision === "ERROR") return reply({ error: "DIRECTORY_UNAVAILABLE" }, 503);
        const full = access.decision === "ALLOW";
        const select = full ? "region,kind,country_code,country,name,official_url,summary,coverage" : "region,kind,country_code,country,name";
        const databaseHeaders = new Headers();
        databaseHeaders.set("apikey", serviceKey);
        databaseHeaders.set("Authorization", `Bearer ${serviceKey}`);
        if (fintech) {
            const result = await fetch(projectUrl + '/rest/v1/gpir_fintech_source_catalog?select=record', { headers: databaseHeaders });
            if (!result.ok) return reply({ error: 'DIRECTORY_UNAVAILABLE' }, 503);
            const records = (await result.json()).map((row: {record: Record<string, any>}) => row.record);
            const regions = [...new Set(records.flatMap((row: any) => row.regions))];
            const ranked = [...records].sort((a, b) =>
                Number(b.approved) - Number(a.approved) || a.name.localeCompare(b.name));
            const previewLimit = Math.floor(records.length / 10);
            const preview = new Set(ranked.filter(row => row.approved).slice(0, previewLimit));
            for (const region of [...new Set([...regions, 'Global'])].sort()) {
                if (preview.size >= previewLimit) break;
                const inRegion = (row: any) => row.regions.length ? row.regions.includes(region) : region === 'Global';
                if ([...preview].some(inRegion)) continue;
                const row = ranked.find(inRegion);
                if (row) preview.add(row);
            }
            for (const row of ranked) {
                if (preview.size >= previewLimit) break;
                preview.add(row);
            }
            const cards = full ? records : [...preview].map(row => ({
                name: row.name, regions: row.regions, category: row.category, approved: row.approved, sets: row.sets
            }));
            return reply({ cards, access: access.decision, totals: {
                sources: records.length, approved: records.filter((row: any) => row.approved).length,
                regions: regions.length, categories: new Set(records.map((row: any) => row.category)).size
            } });
        }
        const response = await fetch(`${projectUrl}/rest/v1/gpir_source_directory?select=${select}&order=region,kind,name,country_code`, {
            headers: databaseHeaders
        });
        if (!response.ok) return reply({ error: "DIRECTORY_UNAVAILABLE" }, 503);

        const groups = new Map<string, Array<Record<string, unknown>>>();
        for (const row of await response.json()) {
            const key = `${row.region}:${row.kind}`;
            const group = groups.get(key) ?? [];
            group.push(row);
            groups.set(key, group);
        }
        const cards = [...groups.values()].flatMap((group) =>
            full ? group : group.slice(0, Math.ceil(group.length / 10)));
        return reply({ cards, access: access.decision });
    } catch {
        return reply({ error: "DIRECTORY_UNAVAILABLE" }, 503);
    }
});

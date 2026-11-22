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
        const token = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
        const access = token
            ? await resolveSubscriberAccess({ supabaseUrl: projectUrl, serviceKey, accessToken: token, directoryQaReaderId: qaReaderId })
            : { decision: "UNAUTHENTICATED" };
        if (access.decision === "ERROR") return reply({ error: "DIRECTORY_UNAVAILABLE" }, 503);
        const full = access.decision === "ALLOW";
        const select = full ? "region,kind,country_code,country,name,official_url,summary,coverage" : "region,kind,name";
        const response = await fetch(`${projectUrl}/rest/v1/gpir_source_directory?select=${select}&order=region,kind,name,country_code`, {
            headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
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

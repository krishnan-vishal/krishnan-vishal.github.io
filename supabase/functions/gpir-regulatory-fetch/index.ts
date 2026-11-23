import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";
import {
    FATF_STATEMENTS_URL,
    UNSC_XML_URL,
    regulatoryRedirect,
    regulatoryPublicationTitle,
    parseUnscSnapshot,
    OFAC_EXPORT_BASE,
    assertOfficialSourceUrl,
    lifecycleForTimestamp,
    ofacDeltaUrl,
    parseFatfStatement,
    parseOfacDelta,
    parseOfacRecentActions,
    parseOfacSnapshotMetadata,
    sha256Hex,
    validateBackfillWindow,
    validateFatfSnapshot
} from "../_shared/gpir-regulatory-sources.mjs";

const OFAC_SOURCE_ID = "OFAC-US-001";
const FATF_SOURCE_ID = "FATF-GLOBAL-001";
const UNSC_SOURCE_ID = "UNSC-GLOBAL-001";
const ALLOWED_SOURCES = [OFAC_SOURCE_ID, FATF_SOURCE_ID, UNSC_SOURCE_ID];
const USER_AGENT = "GPIR-ResearchBot/1.0 (+https://fintechoisis.com)";
const MAX_CURRENT_ACTIONS = 5;
const FATF_LINK_LIMIT = 10;

function response(status: number, body: Record<string, unknown>) {
    return Response.json(body, {
        status,
        headers: {
            "cache-control": "no-store",
            "x-content-type-options": "nosniff"
        }
    });
}

function exactPublishedTimestamp(html: string): string | null {
    const candidates = [
        html.match(/["']datePublished["']\s*:\s*["']([^"']+)["']/i)?.[1],
        html.match(/<meta\b[^>]*(?:property|name)=["'](?:article:published_time|date|dcterms\.date)["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ];
    for (const candidate of candidates) {
        if (!candidate || !/[T ]\d{1,2}:\d{2}/.test(candidate)) continue;
        const parsed = Date.parse(candidate);
        if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
    }
    return null;
}

function fatfPublicationDate(html: string): string | null {
    const matches = String(html || "").match(/\b(20\d{2})-(\d{2})-(\d{2})\b/) ||
        String(html || "").match(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/i);
    if (!matches) return null;
    if (/^\d{4}$/.test(matches[1])) return matches[1] + "-" + matches[2] + "-" + matches[3];
    const parsed = Date.parse(matches[1] + " " + matches[2] + " " + matches[3] + " UTC");
    return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : null;
}

function fatfStatementLinks(html: string) {
    const found = new Map<string, { url: string; designation: string; publicationDate: string | null }>();
    const regex = /href=["']([^"']*\/publications\/High-risk-and-other-monitored-jurisdictions\/(call-for-action|increased-monitoring)-[^"'?#]+\.html)["']/gi;
    let match;
    while ((match = regex.exec(html)) !== null) {
        const url = assertOfficialSourceUrl(new URL(match[1], FATF_STATEMENTS_URL).toString(), "FATF");
        const designation = match[2].toLowerCase() === "call-for-action"
            ? "FATF_CALL_FOR_ACTION" : "FATF_INCREASED_MONITORING";
        const nearby = html.slice(Math.max(0, match.index - 300), Math.min(html.length, regex.lastIndex + 300));
        found.set(url, { url, designation, publicationDate: fatfPublicationDate(nearby) });
    }
    return [...found.values()];
}

async function officialFetch(url: string, authority: "OFAC" | "FATF" | "UNSC") {
    let current = assertOfficialSourceUrl(url, authority);
    const options = {
        redirect: "manual" as const,
        headers: {
            "User-Agent": USER_AGENT,
            Accept: "application/xml,text/html,application/xhtml+xml;q=0.9,*/*;q=0.5"
        },
        signal: AbortSignal.timeout(45000)
    };
    for (let hop = 0; hop <= 3; hop++) {
        const result = await fetch(current, options);
        if (![301, 302, 303, 307, 308].includes(result.status)) return { result, finalUrl: current };
        const location = result.headers.get("location");
        await result.body?.cancel();
        if (!location) throw new Error(authority + "_REDIRECT_WITHOUT_LOCATION");
        current = regulatoryRedirect(location, current, authority);
    }
    throw new Error(authority + "_TOO_MANY_REDIRECTS");
}

async function insertDocument(admin: any, row: Record<string, unknown>) {
    const { data, error } = await admin.from("gpir_regulatory_documents")
        .upsert(row, {
            onConflict: "source_id,document_identity,content_sha256",
            ignoreDuplicates: true
        })
        .select("id")
        .maybeSingle();
    if (error) throw new Error("REGULATORY_DOCUMENT_WRITE_FAILED:" + error.message);
    if (data?.id) return data.id;
    const { data: existing, error: lookupError } = await admin.from("gpir_regulatory_documents")
        .select("id")
        .eq("source_id", row.source_id)
        .eq("document_identity", row.document_identity)
        .eq("content_sha256", row.content_sha256)
        .limit(1)
        .maybeSingle();
    if (lookupError || !existing?.id) throw new Error("REGULATORY_DOCUMENT_LOOKUP_FAILED");
    return existing.id;
}

async function insertSanctionsEvents(admin: any, documentId: string, events: Array<Record<string, any>>, publicationDate: string) {
    if (!events.length) return { inserted: 0, deduplicated: 0 };
    const rows = events.map(event => ({
        source_id: OFAC_SOURCE_ID,
        document_id: documentId,
        event_key: event.eventKey,
        action_type: event.action === "NOTICE" ? "REGULATORY_NOTICE" : event.action,
        entity_uid: event.entityUid || null,
        entity_name: event.displayName || null,
        programs: event.programs || [],
        country_codes: [],
        published_at: event.publishedAt && /T\d{2}:\d{2}/.test(event.publishedAt) ? event.publishedAt : null,
        publication_date: publicationDate,
        effective_date: null,
        lifecycle_status: event.publishedAt && lifecycleForTimestamp(event.publishedAt) === "LIVE_12_HOUR" ? "CURRENT" : "HISTORICAL",
        evidence: {
            type: event.evidenceType,
            source_url: event.sourceUrl,
            current_full_snapshot_proof: false,
            jurisdiction_exposure_only: true
        }
    }));
    const { data, error } = await admin.from("gpir_sanctions_change_events")
        .upsert(rows, { onConflict: "event_key", ignoreDuplicates: true }).select("id");
    if (error) throw new Error("SANCTIONS_EVENT_WRITE_FAILED:" + error.message);
    return { inserted: data?.length || 0, deduplicated: rows.length - (data?.length || 0) };
}

async function stageRelayRecord(admin: any, {
    sourceId, documentId, title, canonicalUrl, content, exactTimestamp, fingerprint, metadata
}: Record<string, any>) {
    const filteredTitle = regulatoryPublicationTitle(title);
    if (!filteredTitle) return "OUT_OF_SCOPE";
    const { data: existing, error: readError } = await admin.from("intelligence_raw_ingestion")
        .select("id").eq("content_hash", fingerprint).limit(1);
    if (readError) throw new Error("RELAY_DEDUP_READ_FAILED:" + readError.message);
    if (existing?.length) return "DUPLICATE";
    const { data, error } = await admin.from("intelligence_raw_ingestion").insert({
        source_id: sourceId,
        discovered_url: canonicalUrl,
        canonical_url: canonicalUrl,
        raw_title: filteredTitle.slice(0, 400),
        raw_content: (filteredTitle === title ? content : filteredTitle + " — official regulatory notice.").slice(0, 12000),
        source_published_at: exactTimestamp,
        http_status: 200,
        content_hash: fingerprint,
        ingestion_status: "RAW",
        metadata: {
            ...metadata,
            regulatory_document_id: documentId,
            publication_time_precision: exactTimestamp ? "EXACT_TIMESTAMP" : "DATE_ONLY",
            alert_eligible: Boolean(exactTimestamp)
        }
    }).select("id").single();
    if (error || !data?.id) throw new Error("RELAY_RAW_INSERT_FAILED:" + (error?.message || "missing id"));
    const { data: processed, error: processError } = await admin.rpc("gpir_process_raw_record", { p_raw_id: data.id });
    if (processError) throw new Error("RELAY_PROCESS_FAILED:" + processError.message);
    return String(processed || "UNKNOWN");
}

async function recordFatfSnapshot(admin: any, statements: Array<Record<string, any>>) {
    const snapshot = validateFatfSnapshot(statements);
    const { data: current, error: currentError } = await admin.from("gpir_country_risk_status_history")
        .select("id,country_code,official_designation,publication_date")
        .eq("source_id", FATF_SOURCE_ID)
        .is("effective_to", null);
    if (currentError) throw new Error("FATF_CURRENT_READ_FAILED:" + currentError.message);
    const latest = (current || []).map(item => item.publication_date).filter(Boolean).sort().at(-1);
    if (latest && latest > snapshot.publicationDate) throw new Error("FATF_BACKFILL_ORDER_REQUIRED");
    const next = new Map();
    for (const statement of statements) for (const row of statement.rows) next.set(row.countryCode, {
        ...row, documentId: statement.documentId, documentHash: statement.hash
    });
    let closed = 0;
    for (const item of current || []) {
        const replacement = next.get(item.country_code);
        if (replacement && replacement.officialDesignation === item.official_designation) {
            next.delete(item.country_code);
            continue;
        }
        const { error } = await admin.from("gpir_country_risk_status_history")
            .update({ effective_to: snapshot.publicationDate }).eq("id", item.id).is("effective_to", null);
        if (error) throw new Error("FATF_HISTORY_CLOSE_FAILED:" + error.message);
        closed += 1;
    }
    const inserts = [];
    for (const row of next.values()) {
        inserts.push({
            source_id: FATF_SOURCE_ID,
            document_id: row.documentId,
            country_code: row.countryCode,
            country_name: row.countryName,
            official_designation: row.officialDesignation,
            effective_from: snapshot.publicationDate,
            publication_date: snapshot.publicationDate,
            status_fingerprint: await sha256Hex([
                FATF_SOURCE_ID, row.countryCode, row.officialDesignation,
                snapshot.publicationDate, row.documentHash
            ].join("|")),
            gpir_analytical_risk: "UNRATED",
            gpir_methodology_id: null
        });
    }
    if (inserts.length) {
        const { error } = await admin.from("gpir_country_risk_status_history")
            .upsert(inserts, { onConflict: "status_fingerprint", ignoreDuplicates: true });
        if (error) throw new Error("FATF_HISTORY_INSERT_FAILED:" + error.message);
    }
    return { inserted: inserts.length, closed, unchanged: snapshot.rows.length - inserts.length };
}

async function handleUnscCurrent(admin: any, dryRun: boolean) {
    const { result } = await officialFetch(UNSC_XML_URL, "UNSC");
    if (!result.ok) throw new Error("UNSC_SNAPSHOT_HTTP_" + result.status);
    const xml = await result.text();
    const metadata = parseUnscSnapshot(xml);
    const hash = await sha256Hex(xml);
    if (!dryRun) {
        await insertDocument(admin, {
            source_id: UNSC_SOURCE_ID,
            document_identity: "UNSC-CONSOLIDATED-XML",
            canonical_url: UNSC_XML_URL,
            document_kind: "UNSC_CURRENT_SNAPSHOT",
            publication_date: metadata.publicationDate,
            publication_precision: "DATE_ONLY",
            content_sha256: hash,
            media_type: result.headers.get("content-type"),
            http_status: result.status,
            validation_state: "VALIDATED",
            metadata: { ...metadata, current_snapshot_only: true, historical_proof: false }
        });
    }
    return { ...metadata, hash, databaseWritten: !dryRun };
}

async function handleOfacCurrent(admin: any, dryRun: boolean) {
    const snapshots = [];
    for (const file of ["SDN.XML", "CONSOLIDATED.XML"]) {
        const sourceUrl = OFAC_EXPORT_BASE + file;
        const { result, finalUrl } = await officialFetch(sourceUrl, "OFAC");
        if (!result.ok) throw new Error("OFAC_SNAPSHOT_HTTP_" + result.status);
        const xml = await result.text();
        const metadata = parseOfacSnapshotMetadata(xml, sourceUrl);
        const hash = await sha256Hex(xml);
        snapshots.push({ file, hash, metadata, finalUrl, xml, status: result.status, contentType: result.headers.get("content-type") });
    }
    const { result: indexResponse, finalUrl: indexFinalUrl } = await officialFetch("https://ofac.treasury.gov/recent-actions", "OFAC");
    if (!indexResponse.ok) throw new Error("OFAC_RECENT_ACTIONS_HTTP_" + indexResponse.status);
    const indexHtml = await indexResponse.text();
    const actions = parseOfacRecentActions(indexHtml).slice(0, MAX_CURRENT_ACTIONS);
    if (dryRun) return {
        snapshots: snapshots.map(item => ({ file: item.file, hash: item.hash, ...item.metadata })),
        actions, databaseWritten: false
    };

    for (const item of snapshots) {
        await insertDocument(admin, {
            source_id: OFAC_SOURCE_ID,
            document_identity: "OFAC-SLS-" + item.file,
            canonical_url: OFAC_EXPORT_BASE + item.file,
            document_kind: "OFAC_CURRENT_SNAPSHOT",
            published_at: item.metadata.publishedDate,
            publication_date: item.metadata.publishedDate?.slice(0, 10) || null,
            publication_precision: item.metadata.publishedDate ? "DATE_ONLY" : "UNKNOWN",
            content_sha256: item.hash,
            media_type: item.contentType,
            http_status: item.status,
            validation_state: "VALIDATED",
            metadata: {
                record_count: item.metadata.recordCount,
                current_snapshot_only: true,
                historical_proof: false,
                final_download_host: new URL(item.finalUrl).hostname
            }
        });
    }

    const outcomes = await persistOfacActions(admin, actions);
    return { snapshots: snapshots.length, actions: outcomes, indexFinalUrl };
}

async function persistOfacActions(admin: any, actions: ReturnType<typeof parseOfacRecentActions>) {
    const outcomes = [];
    for (const action of actions) {
        const { result, finalUrl } = await officialFetch(action.canonicalUrl, "OFAC");
        if (!result.ok) {
            outcomes.push({ url: action.canonicalUrl, status: result.status, outcome: "UNAVAILABLE" });
            continue;
        }
        const html = await result.text();
        const hash = await sha256Hex(html);
        const exactTimestamp = exactPublishedTimestamp(html);
        const documentId = await insertDocument(admin, {
            source_id: OFAC_SOURCE_ID,
            document_identity: action.canonicalUrl,
            canonical_url: action.canonicalUrl,
            document_kind: "OFAC_RECENT_ACTION",
            published_at: exactTimestamp,
            publication_date: action.publicationDate,
            publication_precision: exactTimestamp ? "EXACT_TIMESTAMP" : "DATE_ONLY",
            content_sha256: hash,
            media_type: result.headers.get("content-type"),
            http_status: result.status,
            validation_state: "VALIDATED",
            metadata: { title: action.title, final_url: finalUrl, event_type: action.eventType }
        });
        const eventKey = await sha256Hex([action.canonicalUrl, action.publicationDate, action.title].join("|"));
        const eventResult = await insertSanctionsEvents(admin, documentId, [{
            eventKey,
            action: "NOTICE",
            displayName: action.title,
            programs: [],
            sourceUrl: action.canonicalUrl,
            publishedAt: exactTimestamp,
            evidenceType: "OFAC_RECENT_ACTION"
        }], action.publicationDate);
        const relay = await stageRelayRecord(admin, {
            sourceId: OFAC_SOURCE_ID,
            documentId,
            title: action.title,
            canonicalUrl: action.canonicalUrl,
            content: action.title + " — official OFAC recent action.",
            exactTimestamp,
            fingerprint: hash,
            metadata: { authority: "OFAC", event_type: action.eventType, source_hash: hash }
        });
        outcomes.push({ url: action.canonicalUrl, exactTimestamp, relay, ...eventResult });
    }
    return outcomes;
}

async function handleOfacNoticeBackfill(admin: any, from: string, to: string, page: unknown, dryRun: boolean) {
    const window = validateBackfillWindow(from, to);
    if (typeof page !== "number" || !Number.isSafeInteger(page) || page < 0 || page > 1000) {
        throw new Error("OFAC_ARCHIVE_PAGE_INVALID");
    }
    const indexUrl = new URL("https://ofac.treasury.gov/recent-actions");
    indexUrl.searchParams.set("page", String(page));
    const { result, finalUrl } = await officialFetch(indexUrl.href, "OFAC");
    if (!result.ok) throw new Error("OFAC_ARCHIVE_INDEX_HTTP_" + result.status);
    const discovered = parseOfacRecentActions(await result.text(), finalUrl);
    if (!discovered.length) throw new Error("OFAC_ARCHIVE_INDEX_NO_DATED_ACTIONS");
    const dates = discovered.map(action => action.publicationDate).sort();
    const actions = discovered.filter(action =>
        regulatoryPublicationTitle(action.title) &&
        action.publicationDate >= window.from.slice(0, 10) &&
        action.publicationDate < window.to.slice(0, 10));
    return {
        window, page, discoveredCount: discovered.length,
        oldestDate: dates[0], newestDate: dates.at(-1),
        actions: dryRun ? actions : await persistOfacActions(admin, actions),
        databaseWritten: !dryRun && actions.length > 0
    };
}

async function handleOfacBackfill(admin: any, from: string, to: string, dryRun: boolean) {
    const window = validateBackfillWindow(from, to);
    const start = Date.parse(window.from);
    const end = Date.parse(window.to);
    const summary = { fetched: 0, inserted: 0, deduplicated: 0, unavailable: 0, rejected: 0 };
    for (let current = start; current < end; current += 86400000) {
        const day = new Date(current).toISOString().slice(0, 10);
        const url = ofacDeltaUrl(day);
        const { result } = await officialFetch(url, "OFAC");
        if (result.status === 404) {
            summary.unavailable += 1;
            continue;
        }
        if (result.status === 429) throw new Error("OFAC_RATE_LIMITED");
        if (!result.ok) {
            summary.rejected += 1;
            continue;
        }
        const xml = await result.text();
        let events;
        try {
            events = parseOfacDelta(xml, { sourceUrl: url, publishedDate: null });
        } catch {
            summary.rejected += 1;
            continue;
        }
        summary.fetched += 1;
        if (dryRun) continue;
        const hash = await sha256Hex(xml);
        const documentId = await insertDocument(admin, {
            source_id: OFAC_SOURCE_ID,
            document_identity: "OFAC-DELTA-" + day,
            canonical_url: url,
            document_kind: "OFAC_DELTA",
            published_at: null,
            publication_date: day,
            publication_precision: "DATE_ONLY",
            content_sha256: hash,
            media_type: result.headers.get("content-type"),
            http_status: result.status,
            validation_state: "VALIDATED",
            metadata: { delta_date: day, historical_change_evidence: true }
        });
        const written = await insertSanctionsEvents(admin, documentId, events, day);
        summary.inserted += written.inserted;
        summary.deduplicated += written.deduplicated;
    }
    if (!dryRun) {
        const { error } = await admin.from("gpir_regulatory_backfill_checkpoints").upsert({
            source_id: OFAC_SOURCE_ID,
            window_start: window.from.slice(0, 10),
            window_end: window.to.slice(0, 10),
            cursor_value: window.to,
            run_status: summary.rejected ? "PARTIAL" : "COMPLETE",
            fetched_count: summary.fetched,
            deduplicated_count: summary.deduplicated,
            validated_count: summary.inserted,
            rejected_count: summary.rejected,
            unavailable_count: summary.unavailable,
            attempt_count: 1,
            updated_at: new Date().toISOString()
        }, { onConflict: "source_id,window_start,window_end" });
        if (error) throw new Error("OFAC_CHECKPOINT_WRITE_FAILED:" + error.message);
    }
    return { window, ...summary, databaseWritten: !dryRun };
}

async function processFatfSnapshot(admin: any, links: Array<Record<string, any>>, dryRun: boolean) {
    const statements = [];
    for (const link of links) {
        const { result, finalUrl } = await officialFetch(link.url, "FATF");
        if (result.status === 429) throw new Error("FATF_RATE_LIMITED");
        if (!result.ok) throw new Error("FATF_STATEMENT_HTTP_" + result.status);
        const html = await result.text();
        const publicationDate = link.publicationDate || fatfPublicationDate(html);
        if (!publicationDate) throw new Error("FATF_PUBLICATION_DATE_MISSING");
        const rows = parseFatfStatement(html, {
            sourceUrl: link.url,
            designation: link.designation,
            publicationDate
        });
        const hash = await sha256Hex(html);
        let documentId = null;
        if (!dryRun) documentId = await insertDocument(admin, {
            source_id: FATF_SOURCE_ID,
            document_identity: link.url,
            canonical_url: link.url,
            document_kind: "FATF_STATEMENT",
            published_at: null,
            publication_date: publicationDate,
            publication_precision: "DATE_ONLY",
            content_sha256: hash,
            media_type: result.headers.get("content-type"),
            http_status: result.status,
            validation_state: "VALIDATED",
            metadata: {
                designation: link.designation,
                country_count: rows.length,
                final_url: finalUrl,
                historical_statement: true
            }
        });
        statements.push({ ...link, publicationDate, rows, hash, documentId, html });
    }
    const snapshot = validateFatfSnapshot(statements);
    if (dryRun) return {
        publicationDate: snapshot.publicationDate,
        statements: statements.map(item => ({
            url: item.url, designation: item.designation, publicationDate: item.publicationDate,
            countryCount: item.rows.length, hash: item.hash
        })),
        countries: snapshot.rows,
        databaseWritten: false
    };
    const status = await recordFatfSnapshot(admin, statements);
    const outcomes = [];
    for (const statement of statements) {
        const relay = await stageRelayRecord(admin, {
            sourceId: FATF_SOURCE_ID,
            documentId: statement.documentId,
            title: statement.designation === "FATF_CALL_FOR_ACTION"
                ? "FATF High-Risk Jurisdictions subject to a Call for Action"
                : "FATF Jurisdictions under Increased Monitoring",
            canonicalUrl: statement.url,
            content: statement.rows.map((row: any) => row.countryName).join(", "),
            exactTimestamp: exactPublishedTimestamp(statement.html),
            fingerprint: statement.hash,
            metadata: {
                authority: "FATF",
                designation: statement.designation,
                country_count: statement.rows.length
            }
        });
        outcomes.push({
            url: statement.url,
            designation: statement.designation,
            publicationDate: statement.publicationDate,
            countryCount: statement.rows.length,
            relay
        });
    }
    return { publicationDate: snapshot.publicationDate, statements: outcomes, status, databaseWritten: true };
}

function latestFatfLinks(links: Array<Record<string, any>>) {
    const dated = links.filter(link => link.publicationDate)
        .sort((left, right) => String(right.publicationDate).localeCompare(String(left.publicationDate)));
    const selected = new Map();
    for (const link of dated) if (!selected.has(link.designation)) selected.set(link.designation, link);
    return [...selected.values()];
}

async function handleFatfCurrent(admin: any, dryRun: boolean) {
    const { result: indexResponse } = await officialFetch(FATF_STATEMENTS_URL, "FATF");
    if (!indexResponse.ok) throw new Error("FATF_INDEX_HTTP_" + indexResponse.status);
    const links = latestFatfLinks(fatfStatementLinks(await indexResponse.text()));
    if (links.length !== 2) throw new Error("FATF_CURRENT_STATEMENTS_INCOMPLETE");
    return processFatfSnapshot(admin, links, dryRun);
}

async function handleFatfBackfill(admin: any, from: string, to: string, dryRun: boolean) {
    const window = validateBackfillWindow(from, to);
    const { result: indexResponse } = await officialFetch(FATF_STATEMENTS_URL, "FATF");
    if (!indexResponse.ok) throw new Error("FATF_INDEX_HTTP_" + indexResponse.status);
    const links = fatfStatementLinks(await indexResponse.text()).filter(link =>
        link.publicationDate && link.publicationDate >= window.from.slice(0, 10) &&
        link.publicationDate < window.to.slice(0, 10));
    const groups = new Map<string, Array<Record<string, any>>>();
    for (const link of links) {
        const group = groups.get(link.publicationDate) || [];
        group.push(link);
        groups.set(link.publicationDate, group);
    }
    const ordered = [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
    let cursor = "";
    if (!dryRun) {
        const { data, error } = await admin.from("gpir_regulatory_backfill_checkpoints")
            .select("cursor_value,run_status,fetched_count,validated_count")
            .eq("source_id", FATF_SOURCE_ID)
            .eq("window_start", window.from.slice(0, 10))
            .eq("window_end", window.to.slice(0, 10))
            .maybeSingle();
        if (error) throw new Error("FATF_CHECKPOINT_READ_FAILED:" + error.message);
        if (data?.run_status === "COMPLETE") return { window, skipped: true, reason: "CHECKPOINT_COMPLETE" };
        cursor = String(data?.cursor_value || "");
    }
    const outcomes = [];
    for (const [publicationDate, statements] of ordered) {
        if (cursor && publicationDate <= cursor.slice(0, 10)) continue;
        if (statements.length !== 2) throw new Error("FATF_BACKFILL_SNAPSHOT_INCOMPLETE:" + publicationDate);
        const result = await processFatfSnapshot(admin, statements, dryRun);
        outcomes.push(result);
        cursor = publicationDate;
        if (!dryRun) {
            const { error } = await admin.from("gpir_regulatory_backfill_checkpoints").upsert({
                source_id: FATF_SOURCE_ID,
                window_start: window.from.slice(0, 10),
                window_end: window.to.slice(0, 10),
                cursor_value: cursor,
                run_status: "RUNNING",
                fetched_count: outcomes.length * 2,
                validated_count: outcomes.reduce((sum, item) =>
                    sum + item.statements.reduce((count: number, value: any) => count + value.countryCount, 0), 0),
                attempt_count: 1,
                updated_at: new Date().toISOString()
            }, { onConflict: "source_id,window_start,window_end" });
            if (error) throw new Error("FATF_CHECKPOINT_WRITE_FAILED:" + error.message);
        }
    }
    if (!dryRun) {
        const { error } = await admin.from("gpir_regulatory_backfill_checkpoints").upsert({
            source_id: FATF_SOURCE_ID,
            window_start: window.from.slice(0, 10),
            window_end: window.to.slice(0, 10),
            cursor_value: cursor || window.to,
            run_status: "COMPLETE",
            fetched_count: outcomes.length * 2,
            validated_count: outcomes.reduce((sum, item) =>
                sum + item.statements.reduce((count: number, value: any) => count + value.countryCount, 0), 0),
            attempt_count: 1,
            updated_at: new Date().toISOString()
        }, { onConflict: "source_id,window_start,window_end" });
        if (error) throw new Error("FATF_CHECKPOINT_COMPLETE_FAILED:" + error.message);
    }
    return { window, snapshots: outcomes, databaseWritten: !dryRun };
}

async function loadSource(admin: any, sourceId: string) {
    const { data, error } = await admin.from("source_registry")
        .select("source_id,source_name,trust_tier,source_status,official_url,feed_or_index_url,parser_profile")
        .eq("source_id", sourceId).limit(2);
    if (error || !data || data.length !== 1) throw new Error("SOURCE_REGISTRY_LOOKUP_FAILED");
    const source = data[0];
    const [authority, expected] = sourceId === OFAC_SOURCE_ID
        ? ["OFAC", "ofac-sls-regulatory-v1"]
        : sourceId === UNSC_SOURCE_ID
            ? ["UNSC", "unsc-consolidated-xml-v1"]
            : ["FATF", "fatf-country-classification-v1"];
    if (source.source_status !== "GREEN" || source.trust_tier !== "T1" || source.parser_profile !== expected) {
        throw new Error("SOURCE_REGISTRY_CONTRACT_MISMATCH");
    }
    assertOfficialSourceUrl(source.official_url, authority);
    assertOfficialSourceUrl(source.feed_or_index_url, authority);
    return source;
}

export default {
    fetch: withSupabase({ auth: ["secret"] }, async (request, ctx) => {
        if (request.method !== "POST") return response(405, { status: "ERROR", code: "METHOD_NOT_ALLOWED" });
        let body: Record<string, any>;
        try {
            body = await request.json();
        } catch {
            return response(400, { status: "ERROR", code: "INVALID_JSON" });
        }
        const sourceId = String(body.source_id || "");
        const mode = String(body.mode || "CURRENT").toUpperCase();
        const dryRun = body.dry_run !== false;
        if (!ALLOWED_SOURCES.includes(sourceId)) return response(400, { status: "ERROR", code: "SOURCE_NOT_ALLOWED" });
        if (!["CURRENT", "BACKFILL"].includes(mode) || (sourceId === UNSC_SOURCE_ID && mode !== "CURRENT")) return response(400, { status: "ERROR", code: "MODE_NOT_ALLOWED" });
        const startedAt = new Date().toISOString();
        let runId: string | null = null;
        try {
            const source = await loadSource(ctx.supabaseAdmin, sourceId);
            if (!dryRun) {
                const { data: run, error } = await ctx.supabaseAdmin.from("intelligence_ingestion_runs")
                    .insert({
                        source_id: sourceId,
                        run_status: "RUNNING",
                        metadata: { milestone: "M42-OFAC-FATF", mode, dry_run: false }
                    }).select("id").single();
                if (error || !run?.id) throw new Error("RUN_CREATE_FAILED:" + (error?.message || "missing id"));
                runId = run.id;
            }
            const result = sourceId === UNSC_SOURCE_ID
                ? await handleUnscCurrent(ctx.supabaseAdmin, dryRun)
                : sourceId === OFAC_SOURCE_ID
                ? mode === "BACKFILL"
                    ? body.archive_page === undefined
                        ? await handleOfacBackfill(ctx.supabaseAdmin, body.from, body.to, dryRun)
                        : await handleOfacNoticeBackfill(ctx.supabaseAdmin, body.from, body.to, body.archive_page, dryRun)
                    : await handleOfacCurrent(ctx.supabaseAdmin, dryRun)
                : mode === "BACKFILL"
                    ? await handleFatfBackfill(ctx.supabaseAdmin, body.from, body.to, dryRun)
                    : await handleFatfCurrent(ctx.supabaseAdmin, dryRun);
            if (runId) {
                const { error } = await ctx.supabaseAdmin.from("intelligence_ingestion_runs").update({
                    completed_at: new Date().toISOString(),
                    run_status: "SUCCESS",
                    records_discovered: Array.isArray((result as any).actions) ? (result as any).actions.length :
                        Array.isArray((result as any).statements) ? (result as any).statements.length : Number((result as any).fetched || 0),
                    records_published: 0,
                    error_message: null,
                    metadata: { milestone: "M42-OFAC-FATF", mode, source_id: sourceId, result }
                }).eq("id", runId);
                if (error) throw new Error("RUN_COMPLETE_FAILED:" + error.message);
            }
            return response(200, {
                status: "OK",
                milestone: "M42-OFAC-FATF",
                source: { id: source.source_id, name: source.source_name },
                mode,
                dryRun,
                result,
                publicationThresholdChanged: false,
                completedAt: new Date().toISOString()
            });
        } catch (error) {
            const code = error instanceof Error ? error.message.split(":")[0] : "UNKNOWN_ERROR";
            if (runId) {
                await ctx.supabaseAdmin.from("intelligence_ingestion_runs").update({
                    completed_at: new Date().toISOString(),
                    run_status: "FAILED",
                    records_published: 0,
                    error_message: code,
                    metadata: { milestone: "M42-OFAC-FATF", mode, source_id: sourceId, safe_error_code: code }
                }).eq("id", runId);
            }
            console.error("M42 regulatory ingestion failed", { sourceId, mode, code });
            return response(code === "OFAC_RATE_LIMITED" ? 429 : 500, {
                status: "ERROR",
                code,
                sourceId,
                mode,
                startedAt,
                failedAt: new Date().toISOString()
            });
        }
    })
};

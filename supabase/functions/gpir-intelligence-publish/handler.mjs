import { validateCandidateSource } from '../_shared/gpir-intelligence-validation.mjs';
import { eventIdentity } from '../_shared/gpir-event-identity.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINAL_DECISIONS = new Set(['PUBLISHED', 'REJECTED', 'DUPLICATE', 'REVIEW']);

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff'
    }
  });
}

function configuration(env) {
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !/^[a-z0-9]{20}\.supabase\.co$/.test(parsed.hostname) || !key)
      return null;
    return { url: parsed.origin, key };
  } catch {
    return null;
  }
}

function serviceHeaders(config, extra = {}) {
  const headers = new Headers(extra);
  headers.set('apikey', config.key);
  headers.set('authorization', `Bearer ${config.key}`);
  headers.set('content-type', 'application/json');
  return headers;
}

async function jsonFetch(fetchImpl, url, init = {}) {
  let response;
  try { response = await fetchImpl(url, init); }
  catch (error) { throw new Error(`SUPABASE_REQUEST_FAILED:${error instanceof Error ? error.message : String(error)}`); }
  let data = null;
  try { data = await response.json(); } catch {}
  if (!response.ok) {
    const code = typeof data?.code === 'string' ? data.code : `HTTP_${response.status}`;
    throw new Error(`SUPABASE_${code}`);
  }
  return data;
}

function boundedBatchSize(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(1, Math.min(10, parsed)) : 5;
}

function isoBoundary(value) {
  if (value == null || value === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function createRestPublicationRepository({ config, fetchImpl = fetch }) {
  const base = `${config.url}/rest/v1`;
  const headers = serviceHeaders(config);

  return {
    async candidates({ limit, from, to }) {
      const query = new URLSearchParams({
        select: 'id,raw_ingestion_id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status,content_fingerprint,created_at',
        candidate_status: 'in.(PENDING,REVIEW)',
        order: 'published_at.asc,id.asc',
        limit: '1000'
      });
      if (from) query.set('published_at', `gte.${from}`);
      if (to) query.append('published_at', `lt.${to}`);
      const candidates = await jsonFetch(fetchImpl, `${base}/intelligence_candidates?${query}`, { headers });
      if (!Array.isArray(candidates) || !candidates.length) return [];
      const ids = candidates.map(item => item.id).filter(id => UUID.test(id));
      const auditQuery = new URLSearchParams({
        select: 'candidate_id,decision',
        candidate_id: `in.(${ids.join(',')})`,
        limit: '1000'
      });
      const audits = await jsonFetch(fetchImpl, `${base}/intelligence_publication_audits?${auditQuery}`, { headers });
      const completed = new Set((Array.isArray(audits) ? audits : [])
        .filter(item => FINAL_DECISIONS.has(item.decision)).map(item => item.candidate_id));
      return candidates.filter(item => !completed.has(item.id)).slice(0, limit);
    },

    async source(sourceId) {
      const query = new URLSearchParams({
        select: 'source_id,source_name,official_url,trust_tier,source_status',
        source_id: `eq.${sourceId}`,
        limit: '2'
      });
      const rows = await jsonFetch(fetchImpl, `${base}/source_registry?${query}`, { headers });
      return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    },

    async start(candidate) {
      await jsonFetch(fetchImpl, `${base}/intelligence_publication_audits?on_conflict=candidate_id`, {
        method: 'POST',
        headers: serviceHeaders(config, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({
          candidate_id: candidate.id,
          decision: 'PROCESSING',
          reason_code: 'SOURCE_VALIDATION_STARTED',
          canonical_url: candidate.canonical_url,
          content_fingerprint: candidate.content_fingerprint,
          source_published_at: candidate.published_at,
          attempted_at: new Date().toISOString(),
          completed_at: null
        })
      });
    },

    async duplicate(candidate, validation) {
      const canonical = new URLSearchParams({
        select: 'id', canonical_url: `eq.${validation.canonicalUrl}`, limit: '1'
      });
      const fingerprint = new URLSearchParams({
        select: 'candidate_id', decision: 'eq.PUBLISHED',
        content_fingerprint: `eq.${validation.contentFingerprint}`, limit: '1'
      });
      const [announcements, audits] = await Promise.all([
        jsonFetch(fetchImpl, `${base}/global_announcements?${canonical}`, { headers }),
        jsonFetch(fetchImpl, `${base}/intelligence_publication_audits?${fingerprint}`, { headers })
      ]);
      return Boolean(announcements?.length || audits?.some(item => item.candidate_id !== candidate.id));
    },

    async record(candidate, validation) {
      const status = validation.decision === 'REJECTED' ? 'REJECTED' :
        validation.decision === 'DUPLICATE' ? 'DUPLICATE' : 'REVIEW';
      await Promise.all([
        jsonFetch(fetchImpl, `${base}/intelligence_candidates?id=eq.${candidate.id}`, {
          method: 'PATCH', headers: serviceHeaders(config, { Prefer: 'return=minimal' }),
          body: JSON.stringify({
            candidate_status: status,
            ticker_eligible: false,
            validation_notes: validation.reasonCode,
            validated_at: new Date().toISOString(),
            validation_version: 'GPIR-G1-PUBLICATION-1'
          })
        }),
        jsonFetch(fetchImpl, `${base}/intelligence_publication_audits?on_conflict=candidate_id`, {
          method: 'POST',
          headers: serviceHeaders(config, { Prefer: 'resolution=merge-duplicates,return=minimal' }),
          body: JSON.stringify({
            candidate_id: candidate.id,
            decision: status,
            reason_code: validation.reasonCode,
            canonical_url: validation.canonicalUrl || candidate.canonical_url,
            content_fingerprint: validation.contentFingerprint || candidate.content_fingerprint,
            source_published_at: validation.sourcePublishedAt || candidate.published_at,
            source_checked_at: new Date().toISOString(),
            source_http_status: validation.sourceHttpStatus || null,
            evidence_excerpt: validation.evidenceExcerpt || null,
            validation_payload: validation.validationPayload || {},
            completed_at: new Date().toISOString()
          })
        })
      ]);
    },

    async publish(candidate, validation) {
      const data = await jsonFetch(fetchImpl, `${base}/rpc/gpir_publish_consolidated_candidate`, {
        method: 'POST', headers,
        body: JSON.stringify({
          p_candidate_id: candidate.id,
          ...await eventIdentity(candidate, validation),
          p_summary: validation.summary,
          p_source_published_at: validation.sourcePublishedAt,
          p_content_fingerprint: validation.contentFingerprint,
          p_validation_payload: {
            ...validation.validationPayload,
            relevance_terms: validation.relevanceTerms,
            evidence_excerpt: validation.evidenceExcerpt,
            source_http_status: validation.sourceHttpStatus
          }
        })
      });
      return data;
    }
  };
}

export async function processCandidate({ candidate, repository, fetchImpl = fetch, now = () => Date.now() }) {
  await repository.start(candidate);
  const source = await repository.source(candidate.source_id);
  const validation = await validateCandidateSource({ candidate, source, fetchImpl, now });
  if (validation.decision !== 'PUBLISHED') {
    await repository.record(candidate, validation);
    return validation;
  }
  if (await repository.duplicate(candidate, validation)) {
    const duplicate = { ...validation, decision: 'DUPLICATE', reasonCode: 'DUPLICATE_PUBLICATION' };
    await repository.record(candidate, duplicate);
    return duplicate;
  }
  const announcementId = await repository.publish(candidate, validation);
  return { ...validation, announcementId };
}

export function createPublicationHandler({ env, fetchImpl = fetch, repository = null,
  now = () => Date.now(), logger = console }) {
  return async function handle(request) {
    if (request.method !== 'POST') return json(405, { status: 'ERROR', code: 'METHOD_NOT_ALLOWED' });
    const config = configuration(env);
    if (!config) return json(503, { status: 'ERROR', code: 'PUBLICATION_CONFIGURATION_REQUIRED' });
    let body = {};
    try { body = await request.json(); } catch { return json(400, { status: 'ERROR', code: 'INVALID_JSON' }); }
    const limit = boundedBatchSize(body.batchSize);
    const from = isoBoundary(body.from);
    const to = isoBoundary(body.to);
    if ((body.from && !from) || (body.to && !to) || (from && to && Date.parse(from) >= Date.parse(to)))
      return json(400, { status: 'ERROR', code: 'INVALID_DATE_RANGE' });
    const store = repository || createRestPublicationRepository({ config, fetchImpl });
    let candidates;
    try { candidates = await store.candidates({ limit, from, to }); }
    catch (error) {
      logger.error('gpir publication candidate query failed', error);
      return json(503, { status: 'ERROR', code: 'CANDIDATE_QUERY_FAILED' });
    }
    const outcomes = [];
    for (const candidate of candidates) {
      try {
        outcomes.push({ candidateId: candidate.id,
          ...(await processCandidate({ candidate, repository: store, fetchImpl, now })) });
      } catch (error) {
        logger.error('gpir candidate publication failed', { candidateId: candidate.id, error });
        const failure = { decision: 'REVIEW', reasonCode: 'PROCESSING_ERROR' };
        try { await store.record(candidate, failure); } catch {}
        outcomes.push({ candidateId: candidate.id, ...failure });
      }
    }
    const count = decision => outcomes.filter(item => item.decision === decision).length;
    return json(200, {
      status: 'OK', processor: 'GPIR-G1-PUBLICATION-1', processed: outcomes.length,
      published: count('PUBLISHED'), rejected: count('REJECTED'),
      duplicates: count('DUPLICATE'), awaitingReview: count('REVIEW'), outcomes
    });
  };
}

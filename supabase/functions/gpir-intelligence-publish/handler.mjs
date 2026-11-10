import { validateCandidateSource } from '../_shared/gpir-intelligence-validation.mjs';
import { eventIdentity } from '../_shared/gpir-event-identity.mjs';
import { ambiguousEditorialKeys, contentfulEditorialConfig, fetchEditorialEntriesForCandidate,
  fetchPublishedEditorialEntries, isVerifiedEditorialApproval, verifyEditorialApproval } from '../_shared/gpir-contentful-editorial.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINAL_DECISIONS = new Set(['PUBLISHED', 'REJECTED', 'DUPLICATE', 'REVIEW']);
const CANDIDATE_PAGE_SIZE = 50;
const MAX_CANDIDATE_PAGES = 20;
const PROCESSING_BUDGET_MS = 45000;
// Transient source or processing failures stay REVIEW but remain retryable while
// the candidate can still qualify for the 12-hour live window. Every retry runs
// the complete source, timestamp, evidence and threshold validation again.
const RETRYABLE_REASONS = /^(SOURCE_FETCH_FAILED|SOURCE_HTTP_(429|500|502|503|504)|PROCESSING_ERROR)$/;
const RETRY_BACKOFF_MS = 30 * 60 * 1000;
const RETRY_WINDOW_MS = 12 * 60 * 60 * 1000;

const TERMINAL_DECISIONS = new Set(['PUBLISHED', 'REJECTED', 'DUPLICATE']);

function auditTime(audit) {
  const time = Date.parse(audit.completed_at || audit.attempted_at || '');
  return Number.isFinite(time) ? time : 0;
}

// A terminal decision always wins; otherwise the most recent attempt decides, so
// an older transient failure can never override a later outcome.
export function effectiveAudit(rows) {
  let selected = null;
  for (const audit of rows) {
    if (!selected) { selected = audit; continue; }
    const terminal = TERMINAL_DECISIONS.has(audit.decision);
    const selectedTerminal = TERMINAL_DECISIONS.has(selected.decision);
    if (terminal !== selectedTerminal) { if (terminal) selected = audit; continue; }
    if (auditTime(audit) > auditTime(selected)) selected = audit;
  }
  return selected;
}

const THRESHOLD_REASON = 'AUTO_PUBLICATION_THRESHOLD_NOT_MET';

function auditIsFinal(audit, candidate, now) {
  if (audit.decision !== 'REVIEW' || !RETRYABLE_REASONS.test(audit.reason_code || '')) return true;
  const published = Date.parse(candidate.published_at || '');
  const completed = Date.parse(audit.completed_at || '');
  return !Number.isFinite(published) || !Number.isFinite(completed) ||
    now - published > RETRY_WINDOW_MS || now - completed < RETRY_BACKOFF_MS;
}

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
    return {
      url: parsed.origin,
      key,
      publicKey: String(env.SUPABASE_ANON_KEY || '').trim(),
      publisherJwt: String(env.GPIR_EDITORIAL_PUBLISHER_JWT || '').trim()
    };
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
  return Number.isInteger(parsed) ? Math.max(1, Math.min(100, parsed)) : 5;
}

function isoBoundary(value) {
  if (value == null || value === '') return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

export function createRestPublicationRepository({ config, fetchImpl = fetch, contentful = null }) {
  const base = `${config.url}/rest/v1`;
  const headers = serviceHeaders(config);

  // Reconsideration: a recent T3 candidate whose threshold review was recorded without
  // any evidence fetch (NOT_ATTEMPTED or a pre-verification audit) is processed again so
  // its article evidence is verified. This is bounded by the 12-hour live window, the
  // 30-minute backoff, the batch limit and the processing budget. It never raises the
  // stored confidence: a verified article below its threshold remains in REVIEW.
  async function reconsiderationDue(audit, candidate, now) {
    if (audit.decision !== 'REVIEW' || audit.reason_code !== THRESHOLD_REASON ||
        audit.validation_payload?.evidence_verification?.attempted === true) return false;
    const published = Date.parse(candidate.published_at || '');
    const completed = Date.parse(audit.completed_at || '');
    if (!Number.isFinite(published) || !Number.isFinite(completed) ||
        published > now || now - published > RETRY_WINDOW_MS || now - completed < RETRY_BACKOFF_MS) return false;
    const query = new URLSearchParams({ select: 'trust_tier,source_status', source_id: `eq.${candidate.source_id}`, limit: '2' });
    const rows = await jsonFetch(fetchImpl, `${base}/source_registry?${query}`, { headers });
    return Array.isArray(rows) && rows.length === 1 && rows[0].trust_tier === 'T3' && rows[0].source_status === 'GREEN';
  }

  return {
    async candidates({ limit, from, to, now = Date.now() }) {
      const selected = [];
      const retries = [];
      const seen = new Set();

      const scan = async ({ status, lower, upper }) => {
        for (let page = 0; page < MAX_CANDIDATE_PAGES && selected.length < limit; page += 1) {
          const query = new URLSearchParams({
            select: 'id,raw_ingestion_id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status,content_fingerprint,country_code,region,created_at',
            candidate_status: status,
            order: 'published_at.asc,id.asc',
            limit: String(CANDIDATE_PAGE_SIZE),
            offset: String(page * CANDIDATE_PAGE_SIZE)
          });
          if (lower) query.set('published_at', `gte.${lower}`);
          if (upper) query.append('published_at', `lt.${upper}`);
          const candidates = await jsonFetch(fetchImpl, `${base}/intelligence_candidates?${query}`, { headers });
          if (!Array.isArray(candidates) || !candidates.length) break;

          const ids = candidates.map(item => item.id).filter(id => UUID.test(id));
          const audited = new Map();
          if (ids.length) {
            const auditQuery = new URLSearchParams({
              select: 'candidate_id,decision,reason_code,attempted_at,completed_at,validation_payload',
              candidate_id: `in.(${ids.join(',')})`,
              order: 'attempted_at.desc,candidate_id.asc',
              limit: '1000'
            });
            const audits = await jsonFetch(fetchImpl, `${base}/intelligence_publication_audits?${auditQuery}`, { headers });
            const grouped = new Map();
            for (const audit of Array.isArray(audits) ? audits : []) {
              if (!grouped.has(audit.candidate_id)) grouped.set(audit.candidate_id, []);
              grouped.get(audit.candidate_id).push(audit);
            }
            for (const [candidateId, rows] of grouped) audited.set(candidateId, effectiveAudit(rows));
          }

          for (const item of candidates) {
            if (seen.has(item.id)) continue;
            const audit = audited.get(item.id);
            if (!audit || !FINAL_DECISIONS.has(audit.decision)) { seen.add(item.id); selected.push(item); }
            else if (!auditIsFinal(audit, item, now) || await reconsiderationDue(audit, item, now)) {
              seen.add(item.id); retries.push(item);
            }
          }
          if (candidates.length < CANDIDATE_PAGE_SIZE) break;
        }
      };

      if (from || to) {
        // Controlled backfill keeps the explicit window and both review states.
        await scan({ status: 'in.(PENDING,REVIEW)', lower: from, upper: to });
      } else {
        // Candidates that can still be live are scanned first, so a backlog of
        // finalized REVIEW rows or older unprocessed items can never starve them.
        // Older REVIEW rows are final (a retry needs a candidate inside the
        // 12-hour window) and are excluded from the scan; older PENDING rows are
        // still processed for the permanent archive.
        const liveFrom = new Date(now - RETRY_WINDOW_MS).toISOString();
        await scan({ status: 'in.(PENDING,REVIEW)', lower: liveFrom });
        await scan({ status: 'eq.PENDING', upper: liveFrom });
      }

      // Never-processed candidates take priority over scheduled retries.
      return [...selected, ...retries].slice(0, limit);
    },

    async editorialEntries() {
      if (!contentful) throw new Error('CONTENTFUL_CONFIGURATION_REQUIRED');
      return fetchPublishedEditorialEntries({ config: contentful, fetchImpl });
    },

    async editorialEntriesFor(candidate) {
      if (!contentful) throw new Error('CONTENTFUL_CONFIGURATION_REQUIRED');
      return fetchEditorialEntriesForCandidate({ config: contentful, fetchImpl, candidate });
    },

    async candidate(candidateId) {
      if (!UUID.test(candidateId)) return null;
      const query = new URLSearchParams({
        select: 'id,raw_ingestion_id,source_id,canonical_url,title,published_at,category,event_type,confidence_score,candidate_status,content_fingerprint,country_code,region,created_at',
        id: `eq.${candidateId}`,
        candidate_status: 'in.(PENDING,REVIEW,VALIDATING)',
        limit: '1'
      });
      const rows = await jsonFetch(fetchImpl, `${base}/intelligence_candidates?${query}`, { headers });
      return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
    },

    async audit(candidateId) {
      const query = new URLSearchParams({
        select: 'candidate_id,decision,reason_code,attempted_at,completed_at',
        candidate_id: `eq.${candidateId}`,
        order: 'attempted_at.desc',
        limit: '20'
      });
      const rows = await jsonFetch(fetchImpl, `${base}/intelligence_publication_audits?${query}`, { headers });
      return Array.isArray(rows) && rows.length ? effectiveAudit(rows) : null;
    },

    async source(sourceId) {
      const query = new URLSearchParams({
        select: 'source_id,source_name,official_url,trust_tier,source_status,country,region_tags,category',
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

    async publish(candidate, validation, source = null, approval = null) {
      if (!isVerifiedEditorialApproval(approval) || validation.editorial !== true ||
          validation.validationPayload?.editorial_verified !== true ||
          approval.candidateId !== String(candidate.id).toLowerCase() ||
          validation.validationPayload.editorial_supabase_record_id !== candidate.id ||
          validation.validationPayload.editorial_entry_id !== approval.entryId ||
          validation.validationPayload.editorial_publication_id !== approval.publicationId ||
          validation.validationPayload.editorial_source_url !== candidate.canonical_url)
        throw new Error('CONTENTFUL_APPROVAL_REQUIRED');
      if (!config.publicKey || !config.publisherJwt ||
          config.publisherJwt === config.key || config.publisherJwt === config.publicKey)
        throw new Error('EDITORIAL_PUBLISHER_CREDENTIAL_REQUIRED');
      const publisherHeaders = new Headers({
        apikey: config.publicKey,
        authorization: `Bearer ${config.publisherJwt}`,
        'content-type': 'application/json'
      });
      const data = await jsonFetch(fetchImpl, `${base}/rpc/gpir_publish_t3_editorial_candidate`, {
        method: 'POST', headers: publisherHeaders,
        body: JSON.stringify({
          p_candidate_id: candidate.id,
          ...await eventIdentity(candidate, validation, source),
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

export async function processCandidate({ candidate, repository, fetchImpl = fetch, now = () => Date.now(),
  editorial = null }) {
  await repository.start(candidate);
  const source = await repository.source(candidate.source_id);
  const editorialApproval = editorial
    ? verifyEditorialApproval({ entries: editorial.entries, candidate, source, ambiguous: editorial.ambiguous })
    : null;
  if (editorialApproval && !editorialApproval.approved) {
    const denied = { decision: 'REVIEW', reasonCode: editorialApproval.reasonCode };
    await repository.record(candidate, denied);
    return denied;
  }
  const validation = await validateCandidateSource({ candidate, source, fetchImpl, now, editorialApproval });
  if (validation.decision !== 'PUBLISHED') {
    await repository.record(candidate, validation);
    return validation;
  }
  if (await repository.duplicate(candidate, validation)) {
    const duplicate = { ...validation, decision: 'DUPLICATE', reasonCode: 'DUPLICATE_PUBLICATION' };
    await repository.record(candidate, duplicate);
    return duplicate;
  }
  if (!isVerifiedEditorialApproval(editorialApproval) || validation.editorial !== true) {
    const pending = { ...validation, decision: 'REVIEW', reasonCode: 'CONTENTFUL_APPROVAL_REQUIRED' };
    await repository.record(candidate, pending);
    return pending;
  }
  const announcementId = await repository.publish(candidate, validation, source, editorialApproval);
  return { ...validation, announcementId };
}

// An editor's change after the last decision, or a due transient retry, re-opens a
// candidate. Terminal decisions are never re-opened.
function editorialDue(audit, candidate, entry, now) {
  if (!audit || !FINAL_DECISIONS.has(audit.decision)) return true;
  if (TERMINAL_DECISIONS.has(audit.decision)) return false;
  if (audit.reason_code === THRESHOLD_REASON) return true;
  if (!auditIsFinal(audit, candidate, now)) return true;
  const updated = Date.parse(entry.updatedAt || '');
  const completed = Date.parse(audit.completed_at || '');
  return Number.isFinite(updated) && Number.isFinite(completed) && updated > completed;
}

// Publishes candidates only through a Contentful entry that is published and
// explicitly approved. No entry, no publication; nothing here approves anything.
export async function processEditorialApprovals({ repository, fetchImpl = fetch, now = () => Date.now(),
  limit = 5, logger = console }) {
  const summary = { entries: 0, published: 0, awaitingReview: 0, skipped: 0, outcomes: [] };
  const entries = await repository.editorialEntries();
  summary.entries = entries.length;
  const ambiguous = ambiguousEditorialKeys(entries);
  const started = Date.now();
  for (const entry of entries) {
    if (summary.outcomes.length >= limit || Date.now() - started >= PROCESSING_BUDGET_MS) break;
    const candidateId = String(entry.fields.supabaseRecordId || '').trim();
    try {
      const candidate = await repository.candidate(candidateId);
      const source = candidate ? await repository.source(candidate.source_id) : null;
      if (!candidate || !['T1', 'T1.5', 'T2', 'T3'].includes(source?.trust_tier)) { summary.skipped += 1; continue; }
      if (!editorialDue(await repository.audit(candidate.id), candidate, entry, now())) { summary.skipped += 1; continue; }
      const entriesForCandidate = await repository.editorialEntriesFor(candidate);
      const outcome = await processCandidate({ candidate, repository, fetchImpl, now,
        editorial: { entries: entriesForCandidate, ambiguous } });
      summary.outcomes.push({ candidateId: candidate.id, entryId: entry.entryId, decision: outcome.decision,
        reasonCode: outcome.reasonCode, announcementId: outcome.announcementId });
      if (outcome.decision === 'PUBLISHED') summary.published += 1;
      else summary.awaitingReview += 1;
    } catch (error) {
      logger.error('gpir editorial publication failed', { candidateId, error });
      summary.skipped += 1;
    }
  }
  return summary;
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
    const store = repository || createRestPublicationRepository({ config, fetchImpl,
      contentful: contentfulEditorialConfig(env) });
    let candidates;
    try { candidates = await store.candidates({ limit, from, to, now: now() }); }
    catch (error) {
      logger.error('gpir publication candidate query failed', error);
      return json(503, { status: 'ERROR', code: 'CANDIDATE_QUERY_FAILED' });
    }
    const outcomes = [];
    const processingStartedAt = Date.now();
    for (const candidate of candidates) {
      if (Date.now() - processingStartedAt >= PROCESSING_BUDGET_MS) break;
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
    let editorial = { status: 'NOT_CONFIGURED' };
    if ((repository || config.publisherJwt) && typeof store.editorialEntries === 'function') {
      try {
        editorial = { status: 'OK', ...(await processEditorialApprovals({ repository: store, fetchImpl, now, limit, logger })) };
      } catch (error) {
        logger.error('gpir editorial approval query failed', error);
        editorial = { status: 'UNAVAILABLE' };
      }
    }
    const count = decision => outcomes.filter(item => item.decision === decision).length;
    return json(200, {
      editorial,
      status: 'OK', processor: 'GPIR-G1-PUBLICATION-1', processed: outcomes.length,
      deferred: Math.max(0, candidates.length - outcomes.length),
      published: count('PUBLISHED'), rejected: count('REJECTED'),
      duplicates: count('DUPLICATE'), awaitingReview: count('REVIEW'), outcomes
    });
  };
}

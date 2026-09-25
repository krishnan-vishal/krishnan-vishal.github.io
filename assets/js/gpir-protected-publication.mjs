const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validSession(session, nowSeconds = Math.floor(Date.now() / 1000)) {
  return session?.user && typeof session.user.id === 'string' && UUID.test(session.user.id) &&
    typeof session.access_token === 'string' && session.access_token.length > 0 &&
    Number.isFinite(session.expires_at) && session.expires_at > nowSeconds;
}

export async function requestProtectedPublication({ supabase, endpoint, publicationId,
  supabaseRecordId, fetchImpl = fetch, nowSeconds } = {}) {
  if (!supabase?.auth || typeof supabase.auth.getSession !== 'function' ||
      typeof endpoint !== 'string' || !endpoint.startsWith('https://')) return null;
  let sessionResponse;
  try { sessionResponse = await supabase.auth.getSession(); }
  catch { return null; }
  if (sessionResponse?.error) return null;
  const session = sessionResponse?.data?.session;
  if (!validSession(session, nowSeconds)) return null;
  let response;
  try {
    response = await fetchImpl(endpoint, { method: 'POST', cache: 'no-store',
      credentials: 'omit', headers: { authorization: `Bearer ${session.access_token}`,
        'content-type': 'application/json' },
      body: JSON.stringify({ publicationId, supabaseRecordId }) });
  } catch { return null; }
  if (!response.ok) return null;
  let result;
  try { result = await response.json(); }
  catch { return null; }
  if (result?.status !== 'ALLOW' || result.publication?.identity !== publicationId ||
      result.publication?.supabaseRecordId !== supabaseRecordId) return null;
  return result.publication;
}

function appendRichText(document, parent, node) {
  if (!node || typeof node !== 'object') return;
  if (node.nodeType === 'text') { parent.append(document.createTextNode(node.value || '')); return; }
  const tags = { paragraph: 'p', 'heading-1': 'h2', 'heading-2': 'h2', 'heading-3': 'h3',
    'heading-4': 'h4', 'unordered-list': 'ul', 'ordered-list': 'ol', 'list-item': 'li', blockquote: 'blockquote' };
  const element = node.nodeType === 'document' ? parent : document.createElement(tags[node.nodeType] || 'div');
  for (const child of node.content || []) appendRichText(document, element, child);
  if (element !== parent) parent.append(element);
}

export function renderProtectedPublication({ document, container, publication }) {
  if (!document || !container || !publication) return false;
  const fragment = document.createDocumentFragment();
  const summary = document.createElement('section');
  summary.className = 'gpir-publication-summary';
  const heading = document.createElement('h2'); heading.textContent = 'Executive summary';
  const paragraph = document.createElement('p'); paragraph.textContent = publication.summary || '';
  summary.append(heading, paragraph); fragment.append(summary);
  const body = document.createElement('article'); body.className = 'gpir-publication-body';
  appendRichText(document, body, publication.body); fragment.append(body);
  container.replaceChildren(fragment);
  container.dataset.gpirAuthState = 'allowed';
  return true;
}

export async function hydrateProtectedPublication({ document = globalThis.document,
  config = globalThis.GPIR_PROTECTED_PUBLICATION_CONFIG } = {}) {
  const main = document?.querySelector?.('[data-gpir-entitlement="gpir-publication"]');
  const container = document?.querySelector?.('#gpir-protected-content');
  if (!main || !container) return false;
  const runtime = config || { supabase: globalThis.GPIR_SUPABASE_CLIENT,
    endpoint: main.dataset.gpirEdgeEndpoint };
  const publication = await requestProtectedPublication({ supabase: runtime.supabase,
    endpoint: runtime.endpoint, publicationId: main.dataset.gpirPublicationId,
    supabaseRecordId: main.dataset.gpirSupabaseRecordId });
  return publication ? renderProtectedPublication({ document, container, publication }) : false;
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => { void hydrateProtectedPublication(); });
}

export { validSession };

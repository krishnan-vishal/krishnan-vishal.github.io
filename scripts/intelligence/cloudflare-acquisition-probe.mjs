// Read-only connectivity probe. No publication, credentials or database writes.
export const sources = Object.freeze({
  'OFAC-US-001': 'https://ofac.treasury.gov/recent-actions',
  'CB-APAC-002': 'https://www.mas.gov.sg/news',
});
export async function probe(sourceId, fetcher = fetch) {
  if (!Object.hasOwn(sources, sourceId)) throw new Error('SOURCE_NOT_ALLOWED');
  const started = Date.now();
  try {
    const response = await fetcher(sources[sourceId], {
      redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: { Accept: 'text/html, application/xml;q=0.9' }
    });
    const result = { sourceId, status: response.status, ok: response.ok,
      contentType: response.headers.get('content-type'), elapsedMs: Date.now()-started };
    await response.body?.cancel();
    return result;
  } catch {
    return { sourceId, ok: false, status: null, elapsedMs: Date.now()-started };
  }
}

import { GITHUB_TECHNICAL_SOURCES, buildGithubReleasesUrl, buildGithubChangesUrl,
  parseGithubReleaseHistory, parseGithubChangeHistory } from './gpir-public-source-adapters.mjs';

export async function fetchTechnicalHistory({ sourceId, since, until, maxPages = 3, fetchImpl = fetch }) {
  if (!Object.hasOwn(GITHUB_TECHNICAL_SOURCES, sourceId)) throw new Error('UNAPPROVED_GITHUB_TECHNICAL_SOURCE');
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 3) throw new Error('INVALID_HISTORY_WINDOW');
  const config = GITHUB_TECHNICAL_SOURCES[sourceId];
  buildGithubChangesUrl(sourceId, { since, until });
  const found = { releases: new Map(), changes: new Map() };
  const pages = { releases: 0, changes: 0 };
  const possiblyTruncated = { releases: false, changes: false };
  for (const kind of ['releases', 'changes']) {
    const windows = [{ since, until }];
    let windowsProcessed = 0;
    while (windows.length) {
    const window = windows.shift();
    windowsProcessed++;
    for (let page = 1; page <= maxPages; page++) {
      const url = kind === 'releases' ? buildGithubReleasesUrl(sourceId, { page }) : buildGithubChangesUrl(sourceId, { ...window, page });
      const response = await fetchImpl(url, { redirect: 'error', headers: { accept: 'application/vnd.github+json', 'user-agent': 'GPIR-ResearchBot/1.0', 'x-github-api-version': '2022-11-28' } });
      if (!response.ok) throw new Error(`GITHUB_${kind.toUpperCase()}_FETCH_FAILED_HTTP_${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload)) throw new Error('INVALID_GITHUB_HISTORY_PAYLOAD');
      pages[kind]++;
      const parsed = kind === 'releases' ? parseGithubReleaseHistory(payload, sourceId, { since, until }) : parseGithubChangeHistory(payload, sourceId, window);
      for (const item of parsed) found[kind].set(kind === 'releases' ? item.tag : item.sha, { ...item, acquisitionUrl: url, acquisitionStatus: response.status });
      if (payload.length < 100) break;
      if (page === maxPages) {
        const start = Date.parse(`${window.since}T00:00:00Z`), end = Date.parse(`${window.until}T00:00:00Z`);
        if (kind === 'changes' && start < end && windowsProcessed + windows.length + 2 <= 31) {
          const middle = start + Math.floor((end - start) / 86400000 / 2) * 86400000;
          windows.push({ since: window.since, until: new Date(middle).toISOString().slice(0, 10) },
            { since: new Date(middle + 86400000).toISOString().slice(0, 10), until: window.until });
        } else possiblyTruncated[kind] = true;
      }
    }
    }
  }
  const discoveredAt = new Date().toISOString();
  const records = [];
  for (const kind of ['releases', 'changes']) {
    for (const item of found[kind].values()) {
      const release = kind === 'releases';
      const recordType = release ? 'SOFTWARE_RELEASE' : 'TECHNICAL_CHANGE';
      const identity = JSON.stringify([item.provider, item.repository, recordType, release ? item.tag : item.sha]);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
      const contentHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
      records.push({
        source_id: sourceId, discovered_url: item.acquisitionUrl, canonical_url: item.url,
        raw_title: release ? `${item.product} ${item.tag} release` : `${item.product} change ${item.sha.slice(0, 12)}`,
        raw_content: JSON.stringify(release ? { repository: item.repository, tag: item.tag, name: item.name, published_at: item.publishedAt, release_notes: item.body } : { repository: item.repository, path: item.path, sha: item.sha, committed_at: item.publishedAt, message: item.message }),
        discovered_at: discoveredAt, source_published_at: release ? item.publishedAt : null, http_status: item.acquisitionStatus,
        content_hash: contentHash, ingestion_status: 'PROCESSED', rejection_reason: null,
        metadata: { engine: 'M39-GATE2-GITHUB-V1', parser_profile: 'github-technical-history-v1', acquisition_method: 'A', provider: config.provider,
          data_class: 'TECHNICAL_REFERENCE', record_type: recordType, topic: config.topic, product: config.product,
          repository: item.repository, source_url: item.url, specification_url: config.specificationUrl, documentation_url: config.documentationUrl,
          commit_timestamp: release ? null : item.publishedAt,
          publication_eligible: false, alert_eligible: false, settlement_telemetry: false }
      });
    }
  }
  return { records, statistics: { pages_fetched: pages, releases_discovered: found.releases.size, changes_discovered: found.changes.size, possibly_truncated: possiblyTruncated } };
}
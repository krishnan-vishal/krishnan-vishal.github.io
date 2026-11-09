// Topic-centric intelligence shared by the browser and the Edge functions.
// supabase/functions/_shared/gpir-topic-intelligence.mjs is an identical copy of
// assets/js/gpir-topic-intelligence.mjs (enforced by a test); edit both together.
// Pure, dependency-free and deterministic: no network, clock or storage access.
const DAY = 86400000;
const CONTEXT_DAYS = 30;
const MERGE_SIMILARITY = 0.7;
const MERGE_MIN_SHARED_TOKENS = 4;
const MERGE_WINDOW_MS = 48 * 3600000;

export const TOPIC_TAXONOMY = Object.freeze([
  { id: 'regulatory', label: 'Regulatory Actions', aliases: ['regulation','regulatory','central bank','policy','oversight','enforcement'] },
  { id: 'licences', label: 'Licences & Authorisations', aliases: ['licence','license','licensing','authorisation','authorization','approval'] },
  { id: 'cross-border', label: 'Cross-Border Payments', aliases: ['cross-border','cross border','correspondent','international payment'] },
  { id: 'real-time', label: 'Real-Time Payments', aliases: ['real-time','real time','instant payment','faster payment','rtp'] },
  { id: 'infrastructure', label: 'Payment Infrastructure', aliases: ['payment infrastructure','payment rail','settlement','clearing','payment network','payments network'] },
  { id: 'remittances', label: 'Remittances', aliases: ['remittance','diaspora','money transfer'] },
  { id: 'wallets', label: 'Wallets & Digital Payments', aliases: ['wallet','digital payment','mobile payment','embedded payment'] },
  { id: 'aml', label: 'AML, KYC & Compliance', aliases: ['aml','cft','kyc','compliance','sanction','financial crime'] },
  { id: 'fraud', label: 'Fraud & Cybersecurity', aliases: ['fraud','cyber','breach','scam','identity theft'] },
  { id: 'cbdc', label: 'CBDCs & Digital Money', aliases: ['cbdc','digital money','digital currency','tokenised deposit','tokenized deposit'] },
  { id: 'stablecoins', label: 'Stablecoins & Digital Assets', aliases: ['stablecoin','digital asset','crypto','blockchain','tokenization','tokenisation'] },
  { id: 'deals', label: 'Deals & Partnerships', aliases: ['partnership','partner with','memorandum','consortium','deal','acquisition','merger','investment'] },
  { id: 'payments', label: 'Payments', aliases: ["payment services","payments industry","payment system","cashless payments","credit transfer"] },
  { id: 'fintech', label: 'Fintech', aliases: ["fintech","financial technology"] },
  { id: 'global-regional-fintech', label: 'Global & Regional Fintech', aliases: ["global fintech","regional fintech","fintech ecosystem"] },
  { id: 'pass', label: 'PASS', aliases: ["pass platform","pass service"] },
  { id: 'taas', label: 'TaaS', aliases: ["treasury as a service","taas"] },
  { id: 'saas', label: 'SaaS', aliases: ["software as a service","saas"] },
  { id: 'caas', label: 'CaaS', aliases: ["compliance as a service","caas"] },
  { id: 'baas', label: 'BaaS', aliases: ["banking as a service","baas"] },
  { id: 'pobo', label: 'POBO', aliases: ["payment on behalf of","payments on behalf of","pobo"] },
  { id: 'cobo', label: 'COBO', aliases: ["collection on behalf of","collections on behalf of","cobo"] },
  { id: 'global-aggregators', label: 'Global Aggregators', aliases: ["global aggregator","global payment aggregator"] },
  { id: 'regional-aggregators', label: 'Regional Aggregators', aliases: ["regional aggregator","regional payment aggregator"] },
  { id: 'payments-licensing', label: 'Payments Licensing', aliases: ["payment institution licence","payment institution license","payments licensing","payment services licence","payment services license"] },
  { id: 'fintech-licensing', label: 'Fintech Licensing', aliases: ["fintech licence","fintech license","fintech licensing"] },
  { id: 'corporate-payments', label: 'Corporate Payments', aliases: ["corporate payment","business payment","b2b payment"] },
  { id: 'diaspora-payments', label: 'Diaspora Payments', aliases: ["diaspora payment","diaspora remittance"] },
  { id: 'immigrant-payments', label: 'Immigrant Payments', aliases: ["immigrant payment","immigrant remittance"] },
  { id: 'migrant-movements', label: 'Migrant International Movements', aliases: ["international migration","migrant movement","migration corridor"] },
  { id: 'money-movements', label: 'Money Movements', aliases: ["money movement","funds movement"] },
  { id: 'super-apps', label: 'Super Apps', aliases: ["super app","super-app"] },
  { id: 'bnpl', label: 'BNPL', aliases: ["buy now pay later","bnpl"] },
  { id: 'apm', label: 'Alternative Payment Methods (APM)', aliases: ["alternative payment method","apm"] },
  { id: 'cards-money-movements', label: 'Cards – Money Movements', aliases: ["card-based transfer","card to card","card payout","card payment"] },
  { id: 'payment-gateways', label: 'Payment Gateways', aliases: ["payment gateway","payment gateways"] }
]);

const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'new', 'its', 'has', 'will',
  'announces', 'announced', 'announce', 'launches', 'launched', 'launch', 'expands', 'expanded', 'says', 'said']);
const GLOBAL_SCOPE = new Set(['', 'global', 'worldwide', 'international', 'multiple']);
const CORRIDOR_PATTERNS = [
  /\b([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)\s*(?:–|—|-|→|\/)\s*([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)\s+(?:payment |remittance |cross-border )?corridor\b/,
  /\bcorridor\s+(?:between|from)\s+([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)\s+(?:and|to)\s+([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)/,
  /\b([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)\s+to\s+([A-Z][A-Za-z.]+(?: [A-Z][A-Za-z.]+)?)\s+(?:payment |remittance |money transfer )?(?:corridor|remittances?)\b/
];

function text(value, max = 400) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function haystack(record) {
  return [record.category, ...(record.topics || []), ...(record.keywords || []), record.title, record.summary]
    .filter(Boolean).join(' ').toLowerCase();
}

export function classifyTopicIds(record) {
  // Technical specifications are implementation evidence: they stay in the infrastructure
  // lane and are not classified by boundary language such as "not a regulatory event".
  if (record.dataClass === 'TECHNICAL_REFERENCE') return ['infrastructure'];
  const content = haystack(record);
  return TOPIC_TAXONOMY.filter(topic => topic.aliases.some(alias => content.includes(alias))).map(topic => topic.id);
}

function primaryTopicId(record, topicIds) {
  const content = haystack(record);
  let best = null;
  let bestHits = 0;
  for (const id of topicIds) {
    const topic = TOPIC_TAXONOMY.find(item => item.id === id);
    const hits = topic.aliases.reduce((total, alias) => total + (content.includes(alias) ? 1 : 0), 0);
    if (hits > bestHits) { best = id; bestHits = hits; }
  }
  return best;
}

function corridorOf(record) {
  const content = `${record.title || ''}. ${record.summary || ''}`;
  for (const pattern of CORRIDOR_PATTERNS) {
    const match = pattern.exec(content);
    if (match) return `${text(match[1], 60)} → ${text(match[2], 60)}`;
  }
  return null;
}

// Topic descriptor: keywords, country, corridor and payment theme for one development.
export function classifyDevelopment(record) {
  const topicIds = classifyTopicIds(record);
  const primary = primaryTopicId(record, topicIds);
  const country = text(record.country, 100);
  return Object.freeze({
    topicIds, primaryTopicId: primary,
    theme: primary ? TOPIC_TAXONOMY.find(topic => topic.id === primary).label : text(record.category, 100) || 'Payments',
    country: GLOBAL_SCOPE.has(country.toLowerCase()) ? null : country,
    region: text(record.region, 100) || null,
    corridor: corridorOf(record),
    keywords: [...new Set((record.keywords || []).map(value => text(value, 80)).filter(Boolean))].slice(0, 12)
  });
}

function titleTokens(record) {
  return new Set(String(record.title || '').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, ' ')
    .split(' ').filter(token => token.length > 2 && !STOP_WORDS.has(token)).map(token => token.replace(/s$/, '')));
}

function similarity(left, right) {
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  return { shared, ratio: union ? shared / union : 0 };
}

function recordUrl(record) { return record.canonicalUrl || record.url || null; }
function recordSource(record) { return text(record.source?.name || record.sourceName, 140) || 'Authoritative source'; }

function supportingSource(record) {
  return { name: recordSource(record), url: recordUrl(record), publishedAt: record.publishedAt,
    trustTier: text(record.source?.trustTier || record.sourceTrustTier, 20) || null };
}

function sameGroup(left, right) {
  if (left.record.eventId && left.record.eventId === right.record.eventId) return true;
  // Similar headlines far apart in time are separate developments (for example recurring reports).
  if (Math.abs(left.time - right.time) > MERGE_WINDOW_MS) return false;
  const leftScope = (left.topic.country || '').toLowerCase();
  const rightScope = (right.topic.country || '').toLowerCase();
  if (leftScope && rightScope && leftScope !== rightScope) return false;
  if (left.topic.primaryTopicId !== right.topic.primaryTopicId) return false;
  if (left.topic.corridor && right.topic.corridor && left.topic.corridor !== right.topic.corridor) return false;
  const { shared, ratio } = similarity(left.tokens, right.tokens);
  return shared >= MERGE_MIN_SHARED_TOKENS && ratio >= MERGE_SIMILARITY;
}

// Collapses overlapping reports of one development into a topic-level item. The item keeps
// the ORIGINAL (earliest) publication timestamp, so the 12-hour window is never extended by
// later corroboration, and retains every individual source as supporting evidence.
export function groupRelayItems(records) {
  const entries = (records || []).map(record => ({ record, topic: record.topic || classifyDevelopment(record),
    tokens: titleTokens(record), time: Date.parse(record.publishedAt || '') }))
    .filter(entry => Number.isFinite(entry.time))
    .sort((left, right) => left.time - right.time || String(left.record.id).localeCompare(String(right.record.id)));
  const groups = [];
  for (const entry of entries) {
    const group = groups.find(candidate => sameGroup(candidate.lead, entry) ||
      (entry.record.eventId && candidate.members.some(member => member.record.eventId === entry.record.eventId)));
    if (group) group.members.push(entry); else groups.push({ lead: entry, members: [entry] });
  }
  return groups.map(({ lead, members }) => {
    const seen = new Set();
    // Already-grouped input keeps the members and sources it carries, so grouping is idempotent.
    const supportingSources = members.flatMap(member => member.record.supportingSources?.length
      ? member.record.supportingSources : [supportingSource(member.record)]).filter(source => {
      const key = source.url || `${source.name}:${source.publishedAt}`;
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return Object.freeze({ ...lead.record, topic: lead.topic, publishedAt: lead.record.publishedAt,
      memberIds: members.flatMap(member => member.record.memberIds || [member.record.id]), supportingSources,
      corroboratingReports: Math.max(0, supportingSources.length - 1) });
  }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt) || String(left.id).localeCompare(String(right.id)));
}

// Subscriber topic intelligence for one selected relay item: related topic-level items from
// the last 30 days and from the permanent repository history, with supporting sources.
export function buildTopicContext(alert, records, now = Date.now()) {
  const grouped = groupRelayItems(records);
  const lead = grouped.find(item => item.memberIds.includes(alert.id));
  if (!lead) return null;
  const reference = Boolean(lead.dataClass?.endsWith?.('_REFERENCE'));
  const topicIds = lead.topic.topicIds;
  const related = grouped.filter(item => item !== lead &&
    (reference || !item.dataClass?.endsWith?.('_REFERENCE')) &&
    (topicIds.length ? item.topic.topicIds.some(id => topicIds.includes(id)) : item.category === lead.category));
  const boundary = now - CONTEXT_DAYS * DAY;
  const current = related.filter(item => Date.parse(item.publishedAt) >= boundary);
  const historical = related.filter(item => Date.parse(item.publishedAt) < boundary);
  return Object.freeze({
    alert: lead, topic: lead.topic, supportingSources: lead.supportingSources,
    developments: lead.developments || [],
    current: current.slice(0, 6), historical: historical.slice(0, 6),
    currentTotal: current.length, historicalTotal: historical.length
  });
}

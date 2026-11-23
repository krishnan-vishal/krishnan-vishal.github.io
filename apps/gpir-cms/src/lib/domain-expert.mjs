export const expertPrefix = 'gpir-expert:'

const nonempty = value => typeof value === 'string' && Boolean(value.trim())
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value)
function url(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed : null
  } catch { return null }
}
const source = value => Boolean(url(value?.url) && nonempty(value?.publisher) && date(value?.checkedAt))
const claim = value => nonempty(value?.text) && source(value?.source)
const claims = value => Array.isArray(value) && value.every(claim)
const tags = value => Array.isArray(value) && value.length > 0 && value.every(nonempty)
const exactKeys = (value, keys) => value && Object.keys(value).every(key => keys.includes(key))
const publicClaim = value => claim(value) && exactKeys(value, ['text', 'source', 'period'])
  && exactKeys(value.source, ['url', 'publisher', 'checkedAt'])

export function expertError(key, value, role, now = new Date()) {
  if (!/^gpir-expert:[0-9a-f]{32}$/.test(key) || value?.kind !== 'gpir-domain-expert' ||
      value.id !== key || !nonempty(value.name) || !url(value.officialBio?.url)) return 'Invalid expert identity or official source.'
  if (value.state === 'REVIEW' || value.state === 'ARCHIVED') return null
  if (value.state !== 'PUBLIC' || role !== 'admin') return 'An owner-authorized admin must release the profile.'
  const review = value.review
  const today = now.toISOString().slice(0, 10)
  const nextYear = new Date(now.getTime() + 366 * 86400000).toISOString().slice(0, 10)
  if (!['identity', 'tenure', 'contribution', 'independentEvidence', 'publicationClearance', 'ownerApproved']
      .every(check => review?.[check] === true) || !date(review.releaseThrough) ||
      review.releaseThrough < today || review.releaseThrough > nextYear ||
      !nonempty(review.ownerApprovalReference) || !nonempty(review.sanctionsScreeningScope)) {
    return 'Complete the evidence, clearance and owner approval checks before release.'
  }
  const summaryWords = typeof value.summary?.text === 'string' ? value.summary.text.trim().split(/\s+/).length : 0
  if (!/^[a-z][a-z0-9 -]+$/.test(value.sortKey ?? '') || ![value.title, value.employer, value.jurisdiction].every(nonempty)
      || ![value.regions, value.industries, value.topics].every(tags) || value.topics.length < 4 || value.topics.length > 6
      || !date(value.checkedAt) || value.checkedAt > today || !source(value.officialBio)
      || !exactKeys(value.officialBio, ['url', 'publisher', 'checkedAt'])
      || !publicClaim(value.summary) || summaryWords < 45 || summaryWords > 70
      || !Number.isInteger(value.verifiedYears) || value.verifiedYears < 10 || !claim(value.tenureEvidence)
      || !claims(value.career) || value.career.length < 2 || value.career.length > 5
      || !value.career.every(item => publicClaim(item) && nonempty(item.period))
      || ![value.qualifications, value.recognition, value.corrections].every(items => claims(items) && items.every(publicClaim))
      || !publicClaim(value.contribution) ||
      value.contribution.source.publisher.trim().toLowerCase() === value.officialBio.publisher.trim().toLowerCase() ||
      url(value.contribution.source.url).hostname === url(value.officialBio.url).hostname) {
    return 'Complete dated, sourced career and profile evidence before release.'
  }
  if ((value.linkedin && (!/^(www\.)?linkedin\.com$/.test(url(value.linkedin.url)?.hostname || '') ||
      !url(value.linkedin.url).pathname.startsWith('/in/') || value.linkedin.identityConfirmed !== true ||
      !exactKeys(value.linkedin, ['url', 'identityConfirmed']))) ||
      (value.portrait && (!url(value.portrait.url) || !nonempty(value.portrait.reuseLicense) ||
      value.portrait.identityConfirmed !== true || !exactKeys(value.portrait, ['url', 'reuseLicense', 'identityConfirmed'])))) {
    return 'Confirm identity and image reuse terms before adding optional media.'
  }
  return null
}

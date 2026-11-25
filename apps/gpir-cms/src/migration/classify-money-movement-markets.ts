import { getPayload } from 'payload'
import config from '../payload.config'

const groups = {
  'Global B2B Payments (SME & Trade)': ['trade-payments', 'education-payments'],
  'Global B2C & C2B Payments': ['marketplace-ecommerce', 'gig-economy-creator-payments', 'healthcare-payments'],
  'Bill Payments': ['bill-payments'],
  'High-Risk Payments': ['gaming-payments', 'betting-payments', 'adult-content-payments'],
  'Regional Structure': ['government-payments', 'travel-payments'],
} as const

async function main() {
  const apply = process.argv.includes('--apply')
  const payload = await getPayload({ config })
  try {
    const plan = []
    const missing = []
    for (const [category, slugs] of Object.entries(groups)) {
      for (const slug of slugs) {
        const result = await payload.find({ collection: 'chapters', where: { slug: { equals: slug } }, limit: 2, depth: 0, overrideAccess: true })
        if (result.totalDocs > 1) throw new Error('Ambiguous chapter: ' + slug)
        if (!result.docs[0]) { missing.push(slug); continue }
        const doc = result.docs[0]
        const previous = doc.sourceModel
        if (previous != null && (typeof previous !== 'object' || Array.isArray(previous))) throw new Error('Unsupported source metadata: ' + slug)
        const sourceModel = { ...(previous || {}), moneyMovementMarkets: { category, homepageResearchDesk: false } }
        plan.push({ id: doc.id, slug, category, sourceModel })
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', matched: plan.map(({slug,category}) => ({slug,category})), missing }))
    if (missing.length) throw new Error('Unresolved canonical chapter identities; no changes applied.')
    if (!apply) return
    for (const item of plan) {
      await payload.update({ collection: 'chapters', id: item.id, data: { sourceModel: item.sourceModel }, overrideAccess: true })
      const verified = await payload.findByID({ collection: 'chapters', id: item.id, depth: 0, overrideAccess: true })
      const actual = verified.sourceModel as { moneyMovementMarkets?: { category?: string, homepageResearchDesk?: boolean } } | null
      if (actual?.moneyMovementMarkets?.category !== item.category || actual.moneyMovementMarkets.homepageResearchDesk !== false) throw new Error('Read-back failed: ' + item.slug)
    }
    console.log(JSON.stringify({ status: 'PAYLOAD_CLASSIFICATION_VERIFIED', count: plan.length, bcp: 'Run existing M41 sync and verify BCP_READBACK_VERIFIED' }))
  } finally { await payload.destroy() }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })

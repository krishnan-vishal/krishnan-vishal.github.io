'use strict';
const fs = require('node:fs');
const assert = require('node:assert/strict');
const groups = {
  'Global B2B Payments (SME &amp; Trade)': ['trade-payments', 'education-payments'],
  'Global B2C &amp; C2B Payments': ['marketplace-ecommerce', 'gig-economy-creator-payments', 'healthcare-payments'],
  'Bill Payments': ['bill-payments'],
  'High-Risk Payments': ['gaming-payments', 'betting-payments'],
  'Regional Structure': ['government-payments', 'travel-payments'],
};
for (const filename of ['index.html', 'pages/intelligence/index.html']) {
  const doc = fs.readFileSync(filename, 'utf8');
  const start = doc.indexOf('<span>Money Movement Markets</span>');
  assert(start >= 0, filename + ': markets menu absent');
  const end = doc.indexOf('<div class="mega-col mega-col--headed">', start + 100);
  assert(end > start, filename + ': menu structure absent');
  const marketMenu = doc.slice(start, end);
  for (const [group, slugs] of Object.entries(groups)) {
    assert(marketMenu.includes(group), filename + ': group absent ' + group);
    for (const slug of slugs) {
      const route = '/pages/chapters/' + slug + '.html';
      assert(marketMenu.includes(route), filename + ': route absent ' + route);
      assert(fs.existsSync('pages/chapters/' + slug + '.html'), 'unresolved chapter ' + slug);
    }
  }
  assert(marketMenu.includes('Adult Content Payments') && marketMenu.includes('Research availability pending'),
    filename + ': unpublished eleventh chapter must be clearly marked');
}
const workflow = fs.readFileSync('.github/workflows/payload-cms-ci.yml', 'utf8');
const classification = workflow.slice(workflow.indexOf('  classify-chapters:'));
assert(classification.includes('payload-production-cutover'), 'protected existing environment required');
assert(!classification.includes('PAYLOAD_DATABASE_URI') && !classification.includes('PAYLOAD_SECRET'),
  'classification must never require runner database secrets');
console.log('MONEY_MOVEMENT_FIRST_BATCH_NAVIGATION_VERIFIED: 10 existing chapter routes; one explicitly unpublished');

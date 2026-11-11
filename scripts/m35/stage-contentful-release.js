'use strict';
const fs = require('node:fs');
const path = require('node:path');

function stage({ siteRoot, repositoryRoot }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(siteRoot, 'routes.json'), 'utf8'));
  if (manifest.releaseAuthorityChecked !== true || manifest.deploymentEligible !== false || !Array.isArray(manifest.routes))
    throw new Error('Expected a governed, non-deploying M35 release artifact.');
  const staged = [], preserved = [];
  for (const item of manifest.routes) {
    if (item.controlledValidation !== false || !/^\/(?!\/)[a-zA-Z0-9/_-]+\/$/.test(item.route))
      throw new Error('Unsafe publication route in manifest.');
    const relative = item.route.replace(/^\/+|\/+$/g, '');
    const source = path.resolve(siteRoot, relative, 'index.html');
    const destination = path.resolve(repositoryRoot, relative, 'index.html');
    if (!source.startsWith(path.resolve(siteRoot) + path.sep) ||
        !destination.startsWith(path.resolve(repositoryRoot) + path.sep))
      throw new Error('Publication route escapes site root.');
    const html = fs.readFileSync(source, 'utf8');
    if (!html.includes('data-gpir-auth-authority="supabase"') ||
        !html.includes('data-gpir-auth-result="required"') ||
        html.includes('data-gpir-auth-result="controlled-validation"'))
      throw new Error('Unsafe protected-content rendering for ' + item.route);
    if (fs.existsSync(destination)) {
      preserved.push(item.route);
      continue;
    }
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, html, 'utf8');
    staged.push(item.route);
  }
  const report = { checked: manifest.routes.length, staged, preservedExistingRoutes: preserved };
  fs.mkdirSync(path.join(repositoryRoot, '.generated', 'm35'), { recursive: true });
  fs.writeFileSync(path.join(repositoryRoot, '.generated', 'm35', 'release-stage-report.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify({ checked: report.checked, staged: staged.length, preserved: preserved.length }) + '\n');
  return report;
}
if (require.main === module) {
  try {
    const [siteRoot, repositoryRoot = '.'] = process.argv.slice(2);
    if (!siteRoot) throw new Error('Usage: stage-contentful-release.js SITE_ROOT [REPOSITORY_ROOT]');
    stage({ siteRoot: path.resolve(siteRoot), repositoryRoot: path.resolve(repositoryRoot) });
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { stage };

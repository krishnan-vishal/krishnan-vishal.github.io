'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { stage } = require('../../scripts/m35/stage-contentful-release');

test('stages protected discovery route while preserving existing pages', () => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'm35-stage-'));
 try {
  const siteRoot = path.join(root, 'build'), repositoryRoot = path.join(root, 'repo');
  const route = '/sample-publication/';
  fs.mkdirSync(path.join(siteRoot, 'sample-publication'), {recursive:true});
  fs.mkdirSync(path.join(repositoryRoot, 'existing'), {recursive:true});
  fs.writeFileSync(path.join(repositoryRoot, 'existing', 'index.html'), 'keep');
  fs.writeFileSync(path.join(siteRoot, 'sample-publication', 'index.html'),
    '<main data-gpir-auth-authority="supabase" data-gpir-auth-result="required"></main>');
  fs.writeFileSync(path.join(siteRoot, 'routes.json'), JSON.stringify({
   releaseAuthorityChecked:true, deploymentEligible:false,
   routes:[{route,controlledValidation:false}]
  }));
  const report=stage({siteRoot,repositoryRoot});
  assert.deepEqual(report.staged,[route]);
  assert.equal(fs.readFileSync(path.join(repositoryRoot,'existing','index.html'),'utf8'),'keep');
  assert.match(fs.readFileSync(path.join(repositoryRoot,'sample-publication','index.html'),'utf8'),/auth-result="required"/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('refuses controlled validation routes', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'m35-stage-'));
 try {
  fs.writeFileSync(path.join(root,'routes.json'),JSON.stringify({
   releaseAuthorityChecked:true,deploymentEligible:false,
   routes:[{route:'/sample/',controlledValidation:true}]
  }));
  assert.throws(()=>stage({siteRoot:root,repositoryRoot:path.join(root,'repo')}),/Unsafe publication route/);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

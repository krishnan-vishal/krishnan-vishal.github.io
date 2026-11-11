'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveReleaseDecisions } = require('../../scripts/m35/verify-contentful-release');
const fs = require('node:fs');
const path = require('node:path');

test('release verification retains strict access class for eligible publications', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/m35/verify-contentful-release.js'), 'utf8');
  assert.match(source, /decision\.release_eligible === true && decision\.access_class !== publication\.accessClass/);
  assert.match(source, /releaseEligible: decision\.release_eligible === true/);
});
test('release verification does not silently promote ineligible policy', () => {
  const source = fs.readFileSync(path.join(__dirname, '../../scripts/m35/verify-contentful-release.js'), 'utf8');
  assert.match(source, /decision\.release_eligible === true \? decision\.access_class : publication\.accessClass/);
  assert.match(source, /if \(!\['PUBLIC', 'AUTHENTICATED', 'ENTITLED'\]/);
});

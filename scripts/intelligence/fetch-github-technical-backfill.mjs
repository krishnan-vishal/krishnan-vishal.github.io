#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchTechnicalHistory } from '../../supabase/functions/_shared/gpir-github-technical.mjs';

export { fetchTechnicalHistory };

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
  fetchTechnicalHistory({ sourceId: args[0], since: option('--since', '2024-11-08'), until: option('--until', new Date().toISOString().slice(0, 10)) })
    .then(result => { const output = JSON.stringify(result) + '\n', out = option('--out', null); if (out) writeFileSync(resolve(out), output); else process.stdout.write(output); })
    .catch(error => { console.error(error); process.exitCode = 1; });
}
import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, mkdir, copyFile, writeFile, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { rootCertificates } from 'node:tls'
import { X509Certificate } from 'node:crypto'
import { spawnSync } from 'node:child_process'

test('setup reuses resources and redacts failed CLI credentials', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'm41-hyperdrive-'))
  try {
    await mkdir(path.join(root, 'scripts'))
    await mkdir(path.join(root, 'node_modules/wrangler/bin'), { recursive: true })
    for (const file of ['setup-hyperdrive.mjs', 'hyperdrive-config.mjs']) {
      await copyFile(path.resolve('scripts', file), path.join(root, 'scripts', file))
    }
    const certificate = rootCertificates.find(pem => {
      const cert = new X509Certificate(pem)
      return cert.ca && Date.parse(cert.validTo) > Date.now()
    })!
    const certName = 'gpir-m41-db-ca-' + new X509Certificate(certificate).fingerprint256.replaceAll(':', '').slice(0, 12).toLowerCase()
    await writeFile(path.join(root, 'ca.crt'), certificate)
    await writeFile(path.join(root, 'wrangler.jsonc'), JSON.stringify({ name: 'gpir-payload-cms' }))
    const stub = [
      'const fs = require("fs"); const args = process.argv.slice(2);',
      'const statePath = ' + JSON.stringify(path.join(root, 'mock-state.json')) + ';',
      'const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, "utf8")) : { uploads: 0, creates: 0 };',
      'const id = "0123456789abcdef0123456789abcdef"; const caId = "12345678-1234-1234-1234-123456789abc";',
      'if (args[0] === "hyperdrive" && args[1] === "list") console.log(state.creates ? "│ " + id + " │ gpir-payload-cms-m41 │" : "No configurations");',
      'else if (args[0] === "cert" && args[1] === "list") console.log(state.uploads ? "ID: " + caId + "\\nName: " + ' + JSON.stringify(certName) + ' + "\\nCA: true\\n" : "");',
      'else if (args[0] === "cert" && args[1] === "upload") { state.uploads++; console.log("ID: " + caId); }',
      'else if (args[0] === "hyperdrive" && args[1] === "create") {',
      'if (process.env.M41_TEST_FAIL === "1") { console.error("Rejected " + args[args.indexOf("--connection-string") + 1]); process.exit(1); }',
      'if (!args.includes("verify-full") || !args.includes("--caching-disabled")) process.exit(2);',
      'state.creates++; console.log("Created new Hyperdrive Postgresql config: " + id);',
      '} else if (args[0] === "hyperdrive" && args[1] === "get") console.log(JSON.stringify({',
      'id, origin: { host: "db.projectref.supabase.co", port: 5432, user: "cms_runtime", database: "postgres" },',
      'mtls: { sslmode: "verify-full", ca_certificate_id: caId }, caching: { disabled: true }',
      '})); else process.exit(3);',
      'fs.writeFileSync(statePath, JSON.stringify(state));',
    ].join('\n')
    await writeFile(path.join(root, 'node_modules/wrangler/bin/wrangler.js'), stub)
    const environment = {
      ...process.env,
      SUPABASE_URL: 'https://projectref.supabase.co',
      PAYLOAD_DATABASE_URI: 'postgresql://cms_runtime.projectref:highly_sensitive_password@aws-0-region.pooler.supabase.com:5432/postgres',
    }
    const run = (env: NodeJS.ProcessEnv = environment) => spawnSync(process.execPath, [
      path.join(root, 'scripts/setup-hyperdrive.mjs'), path.join(root, 'ca.crt'),
    ], { cwd: root, env, encoding: 'utf8' })
    const first = run()
    assert.equal(first.status, 0, first.stderr)
    assert.equal(JSON.parse(first.stdout).sslmode, 'verify-full')
    const second = run()
    assert.equal(second.status, 0, second.stderr)
    assert.deepEqual(JSON.parse(await readFile(path.join(root, 'mock-state.json'), 'utf8')), { uploads: 1, creates: 1 })
    const config = JSON.parse(await readFile(path.join(root, 'wrangler.jsonc'), 'utf8'))
    assert.deepEqual(config.hyperdrive, [{ binding: 'HYPERDRIVE', id: '0123456789abcdef0123456789abcdef', remote: true }])
    assert.doesNotMatch(first.stdout + second.stdout + JSON.stringify(config), /highly_sensitive_password/)
    await writeFile(path.join(root, 'mock-state.json'), JSON.stringify({ uploads: 1, creates: 0 }))
    const failed = run({ ...environment, M41_TEST_FAIL: '1' })
    assert.equal(failed.status, 1)
    assert.doesNotMatch(failed.stderr, /highly_sensitive_password/)
    assert.equal(JSON.parse(failed.stderr).stage, 'create verified Hyperdrive connection')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

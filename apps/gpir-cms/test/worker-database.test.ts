import assert from 'node:assert/strict'
import test from 'node:test'
import net from 'node:net'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { build } from 'esbuild'
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare'

test('native Worker database sockets complete queries and close across requests without teardown rejection', { timeout: 30000 }, async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'm41-worker-socket-'))
  const sockets = new Set<net.Socket>()
  let terminated = 0
  const errors: string[] = []
  const frame = (type: string, body: Buffer) => {
    const size = Buffer.alloc(4); size.writeInt32BE(body.length + 4)
    return Buffer.concat([Buffer.from(type), size, body])
  }
  const server = net.createServer(socket => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    let input = Buffer.alloc(0)
    let startup = true
    socket.on('data', chunk => {
      input = Buffer.concat([input, chunk])
      while (input.length >= (startup ? 4 : 5)) {
        const size = input.readInt32BE(startup ? 0 : 1)
        const total = size + (startup ? 0 : 1)
        if (input.length < total) return
        const type = startup ? '' : input.toString('utf8', 0, 1)
        const body = input.subarray(startup ? 4 : 5, total)
        input = input.subarray(total)
        if (startup) {
          startup = false
          socket.write(Buffer.concat([frame('R', Buffer.alloc(4)), frame('Z', Buffer.from('I'))]))
        } else if (type === 'Q') {
          if (body.toString().includes('FAIL')) {
            socket.destroy()
            return
          }
          const count = Buffer.from([0, 1])
          const column = Buffer.alloc(18)
          column.writeInt32BE(23, 6); column.writeInt16BE(4, 10); column.writeInt32BE(-1, 12)
          const description = frame('T', Buffer.concat([count, Buffer.from('one\0'), column]))
          const valueSize = Buffer.alloc(4); valueSize.writeInt32BE(1)
          const row = frame('D', Buffer.concat([count, valueSize, Buffer.from('1')]))
          socket.write(Buffer.concat([description, row, frame('C', Buffer.from('SELECT 1\0')), frame('Z', Buffer.from('I'))]))
        } else if (type === 'X') {
          terminated++
          socket.end()
        }
      }
    })
  })
  let worker: Miniflare | undefined
  try {
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const port = (server.address() as net.AddressInfo).port
    const entry = path.join(directory, 'entry.mjs')
    await writeFile(entry, [
      'import { Pool } from ' + JSON.stringify(path.resolve('node_modules/pg/lib/index.js')) + ';',
      'import { databasePoolOptions } from ' + JSON.stringify(path.resolve('src/lib/database.ts')) + ';',
      'let pool;',
      'export default { async fetch(request, env) {',
      'pool ??= new Pool(databasePoolOptions({worker:true,environment:{},hyperdrive:{connectionString:env.URI}}));',
      'try { const result = await pool.query(new URL(request.url).pathname === "/fail" ? "SELECT FAIL" : "SELECT 1"); return Response.json(result.rows[0]); }',
      'catch { return new Response("database operation failed", {status:503}); }',
      '} };',
    ].join('\n'))
    const bundle = path.join(directory, 'worker.mjs')
    await build({
      entryPoints: [entry], outfile: bundle, bundle: true, format: 'esm', platform: 'node',
      target: 'es2022', conditions: ['workerd'], external: ['cloudflare:*', 'wrangler'],
      banner: { js: 'import { createRequire } from "node:module"; const require = createRequire("/worker.js");' },
      logLevel: 'silent',
    })
    class CaptureLog extends Log {
      error(message: Error) { errors.push(String(message)) }
    }
    worker = new Miniflare(convertV4MiniflareOptions({
      workers: [{
        name: 'cms-test', modules: true, scriptPath: bundle, modulesRoot: directory,
        compatibilityDate: '2026-10-30', compatibilityFlags: ['nodejs_compat'],
        bindings: { URI: 'postgresql://test:test@127.0.0.1:' + port + '/postgres' },
      }],
      log: new CaptureLog(LogLevel.ERROR),
    }))
    for (let i = 0; i < 3; i++) {
      const response: { status: number; json(): Promise<unknown>; clone(): { text(): Promise<string> } } = await worker.dispatchFetch('https://cms-test.invalid/')
      assert.equal(response.status, 200, await response.clone().text())
      assert.deepEqual(await response.json(), { one: 1 })
    }
    const failed = await worker.dispatchFetch('https://cms-test.invalid/fail')
    assert.equal(failed.status, 503, 'real connection loss must remain visible to the request')
    const recovered = await worker.dispatchFetch('https://cms-test.invalid/')
    assert.equal(recovered.status, 200)
    assert.deepEqual(await recovered.json(), { one: 1 })
    await new Promise(resolve => setTimeout(resolve, 100))
    assert.equal(terminated, 4)
    assert.deepEqual(errors, [])
  } finally {
    if (worker) await worker.dispose()
    for (const socket of sockets) socket.destroy()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(directory, { recursive: true, force: true })
  }
})

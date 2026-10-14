import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const sandboxProjectUrl = 'https://hoewtptllwkcqrgryazu.supabase.co';
const types = new Map([['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.ico', 'image/x-icon']]);

export function previewConfiguration(env = process.env) {
  const publishableKey = env.GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!publishableKey || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) return null;
  return Object.freeze({ url: sandboxProjectUrl, publishableKey });
}

export function createPreviewServer({ env = process.env } = {}) {
  return http.createServer((request, response) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname); }
    catch {
      response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Bad request'); return;
    }

    if (pathname === '/assets/js/gpir-supabase-public-config.js') {
      const config = previewConfiguration(env);
      if (!config) {
        response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store' });
        response.end('Set GPIR_SANDBOX_SUPABASE_PUBLISHABLE_KEY to the Sandbox publishable key.');
        return;
      }
      response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8',
        'cache-control': 'no-store' });
      response.end(`window.GPIR_SUPABASE_PUBLIC_CONFIG = Object.freeze(${JSON.stringify(config)});`);
      return;
    }

    const requested = pathname === '/' ? '/reader/my-gpir/' : pathname;
    let candidate = path.resolve(root, `.${requested}`);
    if (candidate.startsWith(`${root}${path.sep}`) && fs.existsSync(candidate) &&
        fs.statSync(candidate).isDirectory())
      candidate = path.join(candidate, 'index.html');
    if (!candidate.startsWith(`${root}${path.sep}`) || !fs.existsSync(candidate) ||
        !fs.statSync(candidate).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found'); return;
    }
    response.writeHead(200, { 'content-type': types.get(path.extname(candidate)) ||
      'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(candidate).pipe(response);
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2] || 4192);
  process.stdout.write('Starting My GPIR Sandbox preview\n');
  createPreviewServer().listen(port, '127.0.0.1', () => {
    process.stdout.write(`My GPIR Sandbox preview: http://127.0.0.1:${port}/reader/my-gpir/\n`);
    if (!previewConfiguration())
      process.stderr.write('Preview data is disabled until the Sandbox publishable key is configured.\n');
  });
}

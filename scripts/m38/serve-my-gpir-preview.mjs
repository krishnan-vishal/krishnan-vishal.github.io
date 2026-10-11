import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const port = Number(process.argv[2] || 4192);
const types = new Map([['.html', 'text/html; charset=utf-8'], ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.svg', 'image/svg+xml'], ['.png', 'image/png'], ['.ico', 'image/x-icon']]);

http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, `http://127.0.0.1:${port}`).pathname);
  const requested = pathname === '/' ? '/artifacts/m38/my-gpir-empty-state-preview.html' : pathname;
  const candidate = path.resolve(root, `.${requested}`);
  if (!candidate.startsWith(`${root}${path.sep}`) || !fs.existsSync(candidate) ||
      !fs.statSync(candidate).isFile()) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); response.end('Not found'); return;
  }
  response.writeHead(200, { 'content-type': types.get(path.extname(candidate)) ||
    'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(candidate).pipe(response);
}).listen(port, '127.0.0.1', () => {
  process.stdout.write(`M38 preview: http://127.0.0.1:${port}/artifacts/m38/my-gpir-empty-state-preview.html\n`);
});

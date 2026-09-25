'use strict';

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const TYPES = Object.freeze({ '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' });

function parseArgs(argv) {
  const options = { site: null, root: process.cwd(), port: 8765 };
  for (const arg of argv) {
    if (arg.startsWith('--site=')) options.site = arg.slice(7);
    else if (arg.startsWith('--root=')) options.root = arg.slice(7);
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice(7));
    else throw new Error(`Unsupported argument: ${arg}`);
  }
  if (!options.site || !Number.isInteger(options.port) || options.port < 1 || options.port > 65535)
    throw new Error('--site and a valid --port are required.');
  return options;
}

function within(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(candidate);
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`);
}

function fileFor(root, pathname) {
  const relative = pathname.replace(/^\/+/, '');
  const candidate = path.resolve(root, relative || 'index.html');
  if (!within(root, candidate)) return null;
  if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  const index = path.join(candidate, 'index.html');
  return within(root, index) && fs.existsSync(index) && fs.statSync(index).isFile() ? index : null;
}

function createServer({ site, root }) {
  return http.createServer((request, response) => {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end(); return; }
    const file = fileFor(site, pathname) || fileFor(root, pathname);
    const status = file ? 200 : 404;
    const selected = file || path.join(site, '404.html');
    if (!within(site, selected) && !within(root, selected)) { response.writeHead(404); response.end(); return; }
    const type = TYPES[path.extname(selected).toLowerCase()] || 'application/octet-stream';
    response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    if (request.method === 'HEAD') { response.end(); return; }
    fs.createReadStream(selected).pipe(response);
  });
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const server = createServer({ site: path.resolve(options.site), root: path.resolve(options.root) });
    server.listen(options.port, '127.0.0.1', () =>
      process.stdout.write(`Controlled GPIR staging server listening on 127.0.0.1:${options.port}.\n`));
  } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}

module.exports = { createServer, fileFor, parseArgs, within };

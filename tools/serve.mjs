// Local static server for web/ that applies web/_headers (so the CSP is enforced while testing).
// Usage: node tools/serve.mjs [port]   (binds to 127.0.0.1 only)
import { createServer } from 'node:http';
import { readFileSync, statSync, createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = normalize(join(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'web'));
const port = Number(process.argv[2] || 8000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const headers = {};
for (const line of readFileSync(join(root, '_headers'), 'utf8').split('\n')) {
  const m = /^\s+([A-Za-z-]+):\s*(.+)$/.exec(line);
  if (m) headers[m[1]] = m[2].trim();
}

createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let path = normalize(join(root, url));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try { if (statSync(path).isDirectory()) path = join(path, 'index.html'); } catch { res.writeHead(404, headers).end('Not found'); return; }
  try { statSync(path); } catch { res.writeHead(404, headers).end('Not found'); return; }
  res.writeHead(200, { ...headers, 'Content-Type': types[extname(path)] || 'application/octet-stream' });
  createReadStream(path).pipe(res);
}).listen(port, '127.0.0.1', () => console.log(`serving web/ with _headers on http://127.0.0.1:${port}/`));

// Refuse to deploy unless web/ contains only site files, nothing is oversized, and vendor checksums match.
import { readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';

const web = new URL('../web', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const ALLOWED = new Set(['.html', '.css', '.js', '.mjs', '.json', '.png', '.svg', '.woff2', '.txt', '']);
const SKIP_DIRS = new Set(['tests']);
const MAX_BYTES = 25 * 1024 * 1024;
const problems = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
    const ext = extname(name).toLowerCase();
    if (name === '_headers') continue;
    if (!ALLOWED.has(ext)) problems.push(`not a site file: ${p}`);
    if (/\.(env|pt|py|csv|key|pem)$/i.test(name) || name.startsWith('.env')) problems.push(`forbidden file: ${p}`);
    if (st.size > MAX_BYTES) problems.push(`too large (${st.size} bytes): ${p}`);
  }
}
walk(web);
try {
  execFileSync(process.execPath, [new URL('./vendor.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--check'], { stdio: 'inherit' });
} catch {
  problems.push('vendor checksum check failed');
}
if (problems.length) {
  console.error('predeploy check failed:\n' + problems.join('\n'));
  process.exit(1);
}
console.log('predeploy check OK');

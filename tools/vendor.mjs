// Copy pinned third-party files from node_modules (package-lock.json) into web/vendor and web/fonts,
// then record SHA-256 checksums (SECURITY-10/13). Usage: node tools/vendor.mjs [--check]
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const nm = join(root, 'node_modules');
const web = join(root, 'web');

const files = [
  ['globe.gl/dist/globe.gl.min.js', 'vendor/globe.gl.min.js'],
  ['globe.gl/LICENSE', 'vendor/LICENSE.globe.gl.txt'],
  ['chart.js/dist/chart.umd.min.js', 'vendor/chart.umd.min.js'],
  ['chart.js/LICENSE.md', 'vendor/LICENSE.chart.js.txt'],
  ['satellite.js/LICENSE.md', 'vendor/LICENSE.satellite.js.txt'],
  ['@fontsource/fraunces/files/fraunces-latin-400-normal.woff2', 'fonts/fraunces-400.woff2'],
  ['@fontsource/fraunces/files/fraunces-latin-600-normal.woff2', 'fonts/fraunces-600.woff2'],
  ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', 'fonts/plex-sans-400.woff2'],
  ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', 'fonts/plex-sans-500.woff2'],
  ['@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', 'fonts/plex-sans-600.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 'fonts/plex-mono-400.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 'fonts/plex-mono-500.woff2'],
  ['@fontsource/fraunces/LICENSE', 'fonts/LICENSE.fraunces.txt'],
  ['@fontsource/ibm-plex-sans/LICENSE', 'fonts/LICENSE.ibm-plex.txt'],
];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}
const satDist = join(nm, 'satellite.js', 'dist');
for (const p of walk(satDist)) files.push([relative(nm, p), join('vendor', 'satellite.js', relative(satDist, p))]);

// text files are hashed with LF line endings so the check is the same on every platform
const sha = (p) => {
  let b = readFileSync(p);
  if (/\.(txt|js|css|json)$/.test(p)) b = Buffer.from(b.toString('utf8').replace(/\r\n/g, '\n'));
  return createHash('sha256').update(b).digest('hex');
};
const check = process.argv.includes('--check');
const lines = [];
for (const [src, dst] of files) {
  const from = join(nm, src);
  const to = join(web, dst);
  if (!check) {
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
  }
  lines.push(`${sha(from)}  web/${dst.split('\\').join('/')}`);
}
lines.sort((a, b) => a.slice(66).localeCompare(b.slice(66)));
const sumsPath = join(web, 'vendor', 'CHECKSUMS.txt');
if (check) {
  const want = readFileSync(sumsPath, 'utf8').trim().split('\n');
  const bad = [];
  for (const line of want) {
    const [hash, path] = line.split(/\s+/);
    const p = join(root, path);
    if (!existsSync(p) || sha(p) !== hash) bad.push(path);
  }
  if (bad.length) { console.error('checksum mismatch:', bad); process.exit(1); }
  console.log(`vendor checksums OK (${want.length} files)`);
} else {
  writeFileSync(sumsPath, lines.join('\n') + '\n');
  console.log(`vendored ${files.length} files`);
}

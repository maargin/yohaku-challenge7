// Verify security on a live URL (SECURITY-04). GitHub Pages cannot send custom headers, so the CSP and
// Referrer-Policy are also accepted from <meta> tags; X-Frame-Options/frame-ancestors are a documented exception.
// Usage: node tools/check_headers.mjs https://<user>.github.io/<repo>/
const url = process.argv[2];
if (!url || !/^https:\/\//.test(url)) {
  console.error('usage: node tools/check_headers.mjs https://<site>/');
  process.exit(2);
}
const required = {
  'content-security-policy': (v) => v.includes("default-src 'self'") && v.includes("script-src 'self'") && !/script-src[^;]*unsafe-(inline|eval)/.test(v) && v.includes("frame-ancestors 'none'"),
  'strict-transport-security': (v) => /max-age=(\d+)/.test(v) && Number(/max-age=(\d+)/.exec(v)[1]) >= 31536000 && /includesubdomains/i.test(v),
  'x-content-type-options': (v) => v.toLowerCase() === 'nosniff',
  'x-frame-options': (v) => v.toUpperCase() === 'DENY',
  'referrer-policy': (v) => v === 'strict-origin-when-cross-origin',
};
const res = await fetch(url, { redirect: 'follow' });
const html = await res.text();
const meta = (re) => { const m = re.exec(html); return m ? m[1] : null; };
const fromMeta = {
  'content-security-policy': meta(/http-equiv="Content-Security-Policy" content="([^"]+)"/i),
  'referrer-policy': meta(/name="referrer" content="([^"]+)"/i),
};
const exception = new Set(['x-frame-options']);
let ok = res.ok;
console.log(`${res.status} ${res.url}`);
for (const [name, test] of Object.entries(required)) {
  let v = res.headers.get(name) ?? fromMeta[name] ?? null;
  if (v === null && exception.has(name)) { console.log(`EXCEPTION  ${name}: not settable on GitHub Pages (documented)`); continue; }
  let pass = v !== null && test(v);
  if (name === 'content-security-policy' && v && !res.headers.get(name) && !pass) {
    // A <meta> CSP cannot carry frame-ancestors; check everything else and report that part as the exception.
    pass = test(`${v}; frame-ancestors 'none'`);
    if (pass) console.log("EXCEPTION  frame-ancestors: not allowed in a <meta> CSP on GitHub Pages (documented)");
  }
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${v ?? '(missing)'}`);
}
process.exit(ok ? 0 : 1);

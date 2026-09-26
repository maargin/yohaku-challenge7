// Verify the security headers on a live URL (SECURITY-04). Usage: node tools/check_headers.mjs https://example.pages.dev/
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
let ok = res.ok;
console.log(`${res.status} ${res.url}`);
for (const [name, test] of Object.entries(required)) {
  const v = res.headers.get(name);
  const pass = v !== null && test(v);
  ok &&= pass;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${v ?? '(missing)'}`);
}
process.exit(ok ? 0 : 1);

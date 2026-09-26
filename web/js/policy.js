// In-browser forward pass of the exported shared policy (policy.json).
const CLIP = 10;

export function forward(policy, obs) {
  let x = obs.map((o, i) => Math.max(-CLIP, Math.min(CLIP, (o - policy.obs_mean[i]) / policy.obs_std[i])));
  const last = policy.layers.length - 1;
  policy.layers.forEach((layer, k) => {
    const y = layer.W.map((row, r) => row.reduce((acc, w, c) => acc + w * x[c], layer.b[r]));
    x = k < last ? y.map(Math.tanh) : y;
  });
  return x;
}

export function softmax(logits) {
  const m = Math.max(...logits);
  const e = logits.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function parity(policy, testvec) {
  let worst = 0;
  for (const v of testvec) {
    const got = forward(policy, v.obs);
    got.forEach((g, i) => { worst = Math.max(worst, Math.abs(g - v.logits[i])); });
  }
  return worst;
}

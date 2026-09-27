/* ============================================================
   Policy network in the browser (F3).

   A small MLP exported from training: arch e.g. [24, 64, 64, 7],
   tanh between layers, raw logits out. Observations are
   normalised with obs_mean / obs_std first.

   policy.json does not say whether each W is stored [out][in]
   (PyTorch's convention) or [in][out]. A square middle layer
   looks the same either way, so parity() tries both orientations
   and keeps whichever reproduces testvec.json.
   ============================================================ */

export const DEFAULT_ACTIONS = ['hold', 'small_open', 'large_open', 'small_close', 'radial', 'request_yield', 'escalate'];
const TOLERANCE = 1e-4;

export class Policy {
  constructor(spec) {
    if (!spec || !Array.isArray(spec.layers) || !Array.isArray(spec.arch)) throw new Error('policy.json: missing arch or layers');
    this.spec = spec;
    this.arch = spec.arch;
    this.actions = Array.isArray(spec.actions) && spec.actions.length ? spec.actions : DEFAULT_ACTIONS;
    this.mean = spec.obs_mean || new Array(this.arch[0]).fill(0);
    this.std = (spec.obs_std || new Array(this.arch[0]).fill(1)).map((s) => (s === 0 ? 1 : s));
    this.activation = spec.activation === 'relu' ? (x) => Math.max(0, x) : Math.tanh;
    this.orientation = 'out-in';
  }

  logits(obs) {
    if (!obs || obs.length !== this.arch[0]) throw new Error(`observation must have ${this.arch[0]} values`);
    let x = obs.map((v, i) => (v - this.mean[i]) / this.std[i]);
    const last = this.spec.layers.length - 1;
    this.spec.layers.forEach((L, k) => {
      x = this.orientation === 'out-in' ? matvec(L.W, x, L.b) : matvecT(L.W, x, L.b);
      if (k < last) x = x.map(this.activation);
    });
    return x;
  }

  probs(obs) {
    return softmax(this.logits(obs));
  }

  /**
   * Compare against the Python reference vectors.
   * @returns {{ ok, maxErr, n, orientation }}
   */
  parity(testvec) {
    if (!Array.isArray(testvec) || !testvec.length) return { ok: false, maxErr: NaN, n: 0, orientation: null };
    const tryOrientation = (o) => {
      this.orientation = o;
      let maxErr = 0;
      try {
        for (const t of testvec) {
          const out = this.logits(t.obs);
          out.forEach((v, i) => { maxErr = Math.max(maxErr, Math.abs(v - t.logits[i])); });
        }
      } catch (err) {
        return Infinity;
      }
      return Number.isFinite(maxErr) ? maxErr : Infinity;
    };
    const a = tryOrientation('out-in');
    if (a < TOLERANCE) return { ok: true, maxErr: a, n: testvec.length, orientation: 'out-in' };
    const b = tryOrientation('in-out');
    if (b < TOLERANCE) return { ok: true, maxErr: b, n: testvec.length, orientation: 'in-out' };
    this.orientation = a <= b ? 'out-in' : 'in-out';
    return { ok: false, maxErr: Math.min(a, b), n: testvec.length, orientation: null };
  }
}

function matvec(W, x, b) {            // W[out][in]
  if (W[0].length !== x.length) throw new Error('shape mismatch');
  const out = new Array(W.length);
  for (let o = 0; o < W.length; o++) {
    let s = b[o] || 0;
    const row = W[o];
    for (let i = 0; i < row.length; i++) s += row[i] * x[i];
    out[o] = s;
  }
  return out;
}

function matvecT(W, x, b) {           // W[in][out]
  if (W.length !== x.length) throw new Error('shape mismatch');
  const nOut = W[0].length;
  const out = new Array(nOut);
  for (let o = 0; o < nOut; o++) {
    let s = b[o] || 0;
    for (let i = 0; i < W.length; i++) s += W[i][o] * x[i];
    out[o] = s;
  }
  return out;
}

export function softmax(z) {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / sum);
}

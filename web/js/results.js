// Results section: strategy table, training curves (Chart.js) and evaluation plots.
import { store } from './state.js';
import { h, clear, $ } from './dom.js';

const AI = 'Shared AI + rules shield';
const CAPTIONS = {
  'img/plots/learning_curves.png': 'Training curves (mean of 3 seeds).',
  'img/plots/baselines.png': 'Collisions per strategy on 1,000 held-out scenarios.',
  'img/plots/burn_timing.png': 'When satellites burn: the shared AI waits for better tracking data, then burns once.',
  'img/plots/yield_vs_ledger.png': 'Chance of burning versus ledger balance difference.',
};

function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

function chart(canvas, label, xs, ys) {
  if (typeof window.Chart !== 'function') return;
  // eslint-disable-next-line no-new
  new window.Chart(canvas, {
    type: 'line',
    data: { labels: xs.map((x) => (x / 1e6).toFixed(0)), datasets: [{ label, data: ys, borderColor: css('--accent'), pointRadius: 0, borderWidth: 2, tension: 0.2 }] },
    options: {
      animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, title: { display: true, text: label, color: css('--text-2') } },
      scales: {
        x: { title: { display: true, text: 'training steps (millions)', color: css('--text-3') }, ticks: { color: css('--text-3'), maxTicksLimit: 6 }, grid: { color: css('--line') } },
        y: { ticks: { color: css('--text-3') }, grid: { color: css('--line') } },
      },
    },
  });
}

export function init() {
  const r = store.get('data').results;
  const summary = $('#results-summary');
  const tbody = $('#results-table tbody');
  if (!r) { summary.textContent = 'Results are not available right now.'; return; }
  const ai = r.strategies.find((s) => s.name === AI);
  const rules = r.strategies.find((s) => s.name.startsWith('Rules'));
  if (ai && rules) {
    const cls = r.classification || {};
    const sig = r.significance;
    const ca = cls[AI];
    const cr = cls[rules.name];
    const n = r.setup ? r.setup.scenarios.toLocaleString('en-GB') : 'the held-out';
    let text;
    if (ca && cr && sig) {
      const fewer = cr.avoidable_collisions > 0 ? Math.round((1 - ca.avoidable_collisions / cr.avoidable_collisions) * 100) : 0;
      const sigText = sig.p_value < 0.05 ? `statistically significant (p = ${sig.p_value})` : `not statistically significant at this sample size (p = ${sig.p_value})`;
      text = `On ${n} new scenarios, the shared AI behind the rules shield ended ${ca.accuracy_pct}% of them safely, against ${cr.accuracy_pct}% for the rules alone. `
        + `Avoidable collisions: ${ca.avoidable_collisions} vs ${cr.avoidable_collisions} (${fewer}% fewer; ${sigText}). Fuel per event: ${ai.dv_mean_ms} vs ${rules.dv_mean_ms} m/s.`;
    } else {
      text = `The shared AI had ${ai.collisions_pct}% collisions against ${rules.collisions_pct}% for the rules alone, at ${ai.dv_mean_ms} vs ${rules.dv_mean_ms} m/s per event.`;
    }
    summary.textContent = text;
    summary.append(' ', h('span', { class: 'gate', 'data-testid': 'gate-badge', text: r.gate === 'ship' ? 'Gate passed: AI ships behind the shield' : 'Gate: rules-only' }));
    if (ca && cr) {
      const pct = (x, ci) => `${x}%${ci && ci[0] !== null ? ` (${ci[0]}–${ci[1]})` : ''}`;
      const table = h('table', { class: 'results', 'data-testid': 'metrics-table', style: { marginTop: '18px' } },
        h('thead', {}, h('tr', {}, ...['Metric (95% CI)', AI, rules.name].map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', {},
          ...[
            ['Accuracy — scenarios ending safely', pct(ca.accuracy_pct, ca.accuracy_ci95), pct(cr.accuracy_pct, cr.accuracy_ci95)],
            ['Recall — would-collide scenarios resolved', pct(ca.recall_pct, ca.recall_ci95), pct(cr.recall_pct, cr.recall_ci95)],
            ['Precision — burns in would-collide scenarios', pct(ca.precision_pct, ca.precision_ci95), pct(cr.precision_pct, cr.precision_ci95)],
            ['False-alarm rate — burns in safe scenarios', `${ca.false_alarm_pct}%`, `${cr.false_alarm_pct}%`],
            ['Collisions (avoidable / unavoidable)', `${ca.avoidable_collisions} / ${ca.unavoidable_collisions}`, `${cr.avoidable_collisions} / ${cr.unavoidable_collisions}`],
          ].map((row) => h('tr', {}, ...row.map((c, k) => h('td', { text: c, style: k === 0 ? { fontFamily: 'var(--font-body)' } : {} }))))));
      summary.after(table);
      table.after(h('p', { class: 'small muted', text: 'Unavoidable collisions are between two objects that cannot move (debris, silent or out of fuel). Low precision is expected: under uncertainty operators must act on every risky pass, and only some would really have collided.' }));
    }
  }
  clear(tbody);
  for (const s of r.strategies) {
    tbody.append(h('tr', { class: s.name === AI ? 'ai' : null },
      h('td', { text: s.name }), h('td', { text: s.collisions_pct.toFixed(1) }), h('td', { text: s.dv_mean_ms.toFixed(3) }),
      h('td', { text: s.manoeuvres_per_event.toFixed(2) }), h('td', { text: s.burden_gini.toFixed(2) }), h('td', { text: s.escalation_pct.toFixed(1) })));
  }
  const charts = $('#charts');
  clear(charts);
  const c = r.curves;
  if (c.timesteps.length) {
    [['Collision rate', c.collision_rate], ['Mean Δv per cluster (m/s)', c.dv_mean], ['Fairness gap (m/s)', c.fairness_gap]].forEach(([label, ys]) => {
      const canvas = h('canvas', { role: 'img', 'aria-label': `${label} over training` });
      charts.append(h('div', { class: 'chart-card' }, canvas));
      chart(canvas, label, c.timesteps, ys);
    });
  }
  const plots = $('#plots');
  clear(plots);
  for (const p of r.plots) {
    plots.append(h('figure', {}, h('img', { src: p, alt: CAPTIONS[p] ?? 'Evaluation plot', loading: 'lazy' }), h('figcaption', { text: CAPTIONS[p] ?? '' })));
  }
}

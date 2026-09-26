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
    const fewer = rules.collisions_pct > 0 ? Math.round((1 - ai.collisions_pct / rules.collisions_pct) * 100) : 0;
    summary.textContent = r.gate === 'ship'
      ? `Yes, modestly: the shared AI behind the rules shield had ${ai.collisions_pct}% collisions against ${rules.collisions_pct}% for the rules alone (${fewer}% fewer), using the same fuel (${ai.dv_mean_ms} vs ${rules.dv_mean_ms} m/s per event). Doing nothing leads to collisions in ${r.strategies[0].collisions_pct}% of cases.`
      : `Not yet: the rules alone remain the product. The shared AI is shown as an experiment (${ai.collisions_pct}% collisions, ${ai.dv_mean_ms} m/s per event, against ${rules.collisions_pct}% and ${rules.dv_mean_ms} m/s for the rules).`;
    summary.append(' ', h('span', { class: 'gate', 'data-testid': 'gate-badge', text: r.gate === 'ship' ? 'Gate passed: AI ships behind the shield' : 'Gate: rules-only' }));
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

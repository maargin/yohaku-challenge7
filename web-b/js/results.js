/* ============================================================
   Results (F12).

   From results.json:
     strategies -> comparison table (lower is better throughout)
     curves     -> three small line charts over training steps
     plots      -> images produced by the evaluation, if any

   The row for our system is highlighted; in "Rules only" mode
   the rules-only baseline is highlighted instead.
   Charts need Chart.js; without it, the table still renders.
   ============================================================ */

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const COLUMNS = [
  ['collisions_pct', 'Collisions', (v) => `${fmt(v, 1)}%`],
  ['dv_mean_ms', '\u0394v per event', (v) => `${fmt(v, 2)} m/s`],
  ['manoeuvres_per_event', 'Manoeuvres per event', (v) => fmt(v, 2)],
  ['burden_gini', 'Burden inequality (Gini)', (v) => fmt(v, 2)],
  ['escalation_pct', 'Escalations', (v) => `${fmt(v, 1)}%`]
];
const CURVES = [
  ['collision_rate', 'Collision rate', 'chart-collisions'],
  ['dv_mean', '\u0394v per event (m/s)', 'chart-dv'],
  ['fairness_gap', 'Fairness gap', 'chart-fairness']
];

export class ResultsPanel {
  constructor(root) {
    this.root = root;
    this.data = null;
    this.mode = 'ai';
    this.charts = {};
  }

  load(data) {
    this.data = data && Array.isArray(data.strategies) ? data : null;
    this.render();
  }

  setMode(mode) {
    this.mode = mode;
    this._highlight();
  }

  render() {
    const $ = (sel) => this.root.querySelector(sel);
    const has = !!this.data;
    $('#results-empty').hidden = has;
    $('#results-body').hidden = !has;
    if (!has) return;

    this._table($('#results-table'));
    this._charts();
    this._plots($('#results-plots'));
    this._highlight();
  }

  _table(table) {
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');
    for (const label of ['Strategy', ...COLUMNS.map((c) => c[1])]) {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = label;
      hr.append(th);
    }
    thead.append(hr);

    const tbody = document.createElement('tbody');
    for (const s of this.data.strategies) {
      const tr = document.createElement('tr');
      tr.dataset.strategy = s.name;
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = s.name;
      tr.append(th);
      for (const [key, , f] of COLUMNS) {
        const td = document.createElement('td');
        td.className = 'mono';
        td.textContent = Number.isFinite(s[key]) ? f(s[key]) : '\u2014';
        tr.append(td);
      }
      tbody.append(tr);
    }
    table.replaceChildren(thead, tbody);
  }

  _highlight() {
    if (!this.data) return;
    const rows = [...this.root.querySelectorAll('#results-table tbody tr')];
    const isOurs = (n) => /system|\bai\b|policy|mappo/i.test(n) && !/rules only/i.test(n);
    const isRules = (n) => /rules only|rules-only/i.test(n);
    for (const tr of rows) {
      const n = tr.dataset.strategy;
      const on = this.mode === 'rules' ? isRules(n) : isOurs(n);
      tr.classList.toggle('is-highlight', on);
    }
  }

  _charts() {
    const c = this.data.curves;
    if (typeof Chart !== 'function' || !c || !Array.isArray(c.timesteps)) {
      for (const [, , id] of CURVES) {
        const box = document.getElementById(id);
        if (box) box.closest('.results__chart').hidden = true;
      }
      return;
    }
    for (const [key, title, id] of CURVES) {
      const canvas = document.getElementById(id);
      if (!canvas) continue;
      const box = canvas.closest('.results__chart');
      const series = c[key];
      if (!Array.isArray(series) || !series.length) { box.hidden = true; continue; }
      box.hidden = false;
      box.querySelector('.results__chart-title').textContent = title;
      const labels = c.timesteps.map(shortSteps);
      try {
        if (this.charts[key]) this.charts[key].destroy();
        this.charts[key] = new Chart(canvas, {
          type: 'line',
          data: { labels, datasets: [{ data: series, borderColor: css('--accent'), backgroundColor: css('--accent'), borderWidth: 2, pointRadius: 0, tension: 0.25 }] },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 500 },
            plugins: { legend: { display: false }, tooltip: { intersect: false, mode: 'index' } },
            scales: {
              x: { grid: { display: false }, border: { color: css('--line') },
                   ticks: { color: css('--text-faint'), font: { family: css('--font-mono'), size: 10 }, maxTicksLimit: 5, maxRotation: 0 },
                   title: { display: true, text: 'training steps', color: css('--text-faint'), font: { size: 10 } } },
              y: { grid: { color: css('--line') }, border: { display: false }, beginAtZero: true,
                   ticks: { color: css('--text-faint'), font: { family: css('--font-mono'), size: 10 }, maxTicksLimit: 5 } }
            }
          }
        });
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${title} over training: from ${fmt(series[0], 3)} to ${fmt(series[series.length - 1], 3)}.`);
      } catch (err) {
        console.warn('[results] chart failed', err);
        box.hidden = true;
      }
    }
  }

  _plots(root) {
    const list = Array.isArray(this.data.plots) ? this.data.plots : [];
    root.replaceChildren();
    root.hidden = !list.length;
    for (const src of list) {
      const fig = document.createElement('figure');
      fig.className = 'results__plot';
      const img = document.createElement('img');
      // paths in results.json are relative to web/
      img.src = /^(https?:)?\//.test(src) ? src : `../web/${src.replace(/^\.\//, '')}`;
      img.loading = 'lazy';
      const name = src.split('/').pop().replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ');
      img.alt = `Evaluation plot: ${name}`;
      img.addEventListener('error', () => {
        fig.remove();
        if (!root.children.length) root.hidden = true;
        console.warn(`[results] plot not found: ${src}`);
      });
      const cap = document.createElement('figcaption');
      cap.textContent = name;
      fig.append(img, cap);
      root.append(fig);
    }
  }
}

const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '\u2014');
function shortSteps(n) {
  if (!Number.isFinite(n)) return String(n);
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

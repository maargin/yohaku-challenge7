/* ============================================================
   Fairness ledger (F6).

   Per operator: credit balance, fuel spent, dodges absorbed.
   Three small bar charts, because the three measures have
   different units and would be misleading on one axis.

   - balance comes straight from outcome.ledger_after
   - fuel and dodges are accumulated here from outcome.dv_ms,
     once per episode (replays are not counted twice)

   Works without Chart.js: falls back to the text table.
   ============================================================ */

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class FairnessLedger {
  constructor(panel, onUpdate) {
    this.panel = panel;
    this.onUpdate = onUpdate || null;
    this.ops = new Map();          // operator -> { balance, fuel, dodges }
    this.counted = new Set();      // episode ids already applied
    this.charts = {};
    this.hasChart = typeof Chart === 'function';
    this._build();

    // restyle charts when the theme changes
    new MutationObserver(() => this._restyle())
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  /* On episode load: make sure every operator involved has a row. */
  seed(episode) {
    for (const a of episode.agents || []) {
      if (!a.operator || a.operator === 'unknown') continue;
      if (!this.ops.has(a.operator)) {
        this.ops.set(a.operator, { balance: Number(a.ledger) || 0, fuel: 0, dodges: 0 });
      }
    }
    this.render();
  }

  /* On episode end: apply the outcome once. Returns a short summary. */
  applyOutcome(episode) {
    const outcome = episode.outcome || {};
    if (this.counted.has(episode.id)) {
      this._setLast(`${episode.id} already counted \u2014 replays don\u2019t change the ledger.`);
      return null;
    }
    this.counted.add(episode.id);

    const before = new Map([...this.ops].map(([k, v]) => [k, v.balance]));
    const agentsById = new Map((episode.agents || []).map((a) => [String(a.id), a]));
    const movers = [];

    for (const [id, dv] of Object.entries(outcome.dv_ms || {})) {
      const a = agentsById.get(String(id));
      if (!a || !a.operator || a.operator === 'unknown' || !(dv > 0)) continue;
      const row = this._row(a.operator);
      row.fuel += dv;
      row.dodges += 1;
      movers.push(`${a.operator} absorbed the dodge (\u0394v ${dv.toFixed(2)} m/s)`);
    }

    for (const [op, bal] of Object.entries(outcome.ledger_after || {})) {
      this._row(op).balance = Number(bal);
    }

    const shifts = [...this.ops].map(([op, v]) => {
      if (!before.has(op)) return null;          // newly listed, not a change
      const d = v.balance - before.get(op);
      return d ? `${op} ${d > 0 ? '+' : ''}${d}` : null;
    }).filter(Boolean);

    const summary = [
      `${episode.id}:`,
      movers.length ? movers.join('; ') + '.' : 'nobody manoeuvred.',
      shifts.length ? `Credit ${shifts.join(', ')}.` : ''
    ].join(' ').trim();

    this._setLast(summary);
    this.render();
    if (this.onUpdate) this.onUpdate(summary);
    return summary;
  }

  /* ---------- rendering ---------- */

  render() {
    const labels = [...this.ops.keys()];
    const rows = [...this.ops.values()];
    this.empty.hidden = labels.length > 0;
    this._renderTable(labels, rows);
    if (!this.hasChart || !labels.length) return;
    try {
      this._renderCharts(labels, rows);
    } catch (err) {
      console.warn('[ledger] charts unavailable, showing the table instead', err);
      this._fallBackToTable();
    }
  }

  _renderCharts(labels, rows) {
    const balance = rows.map((r) => r.balance);
    const fuel = rows.map((r) => +r.fuel.toFixed(3));
    const dodges = rows.map((r) => r.dodges);
    const maxAbs = Math.max(1, ...balance.map(Math.abs));
    for (const key of ['balance', 'fuel', 'dodges']) {
      this.wraps[key].style.height = `${labels.length * 22 + 34}px`;
    }

    this._chart('balance', labels, balance, balance.map((v) => (v < 0 ? css('--alert') : css('--ok'))),
      { min: -maxAbs, max: maxAbs }, (v) => `${v > 0 ? '+' : ''}${v} credit`);
    this._chart('fuel', labels, fuel, css('--cls-manoeuvrable'), { min: 0, max: niceMax(Math.max(...fuel), 0.4), step: true }, (v) => `${v} m/s`);
    this._chart('dodges', labels, dodges, css('--accent'), { min: 0, max: Math.max(3, ...dodges), precision: 0 }, (v) => `${v} dodge${v === 1 ? '' : 's'}`);

  }

  _chart(key, labels, data, color, range, fmt) {
    const existing = this.charts[key];
    if (existing) {
      existing.data.labels = labels;
      existing.data.datasets[0].data = data;
      existing.data.datasets[0].backgroundColor = color;
      Object.assign(existing.options.scales.x, { min: range.min, max: range.max });
      if (range.step) existing.options.scales.x.ticks.stepSize = range.max / 4;
      existing.update();
      return;
    }
    this.charts[key] = new Chart(this.canvases[key], {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 3, maxBarThickness: 11, categoryPercentage: 0.7, barPercentage: 0.9 }] },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 650, easing: 'easeOutCubic' },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => fmt(ctx.raw) } }
        },
        scales: {
          x: {
            min: range.min, max: range.max,
            grid: { color: css('--line') }, border: { display: false },
            ticks: { color: css('--text-faint'), font: { family: css('--font-mono'), size: 10 }, maxTicksLimit: 5, precision: range.precision, stepSize: range.step ? range.max / 4 : undefined }
          },
          y: {
            grid: { display: false }, border: { display: false },
            // every operator must stay labelled: a missing name reads as a missing operator
            ticks: { color: css('--text-2'), font: { family: css('--font-body'), size: 11 }, autoSkip: false }
          }
        }
      }
    });
  }

  /* Charts created inside a hidden tab measure 0x0. Call when the Ledger tab opens. */
  onShow() {
    for (const chart of Object.values(this.charts)) {
      try { chart.resize(); } catch (e) { /* ignore */ }
    }
  }

  _fallBackToTable() {
    this.hasChart = false;
    for (const c of Object.values(this.charts)) { try { c.destroy(); } catch (e) { /* ignore */ } }
    this.charts = {};
    for (const sec of this.panel.querySelectorAll('.ledger__section')) sec.remove();
    this.panel.querySelector('table').classList.remove('sr-only');
  }

  _restyle() {
    if (!this.hasChart) return;
    for (const chart of Object.values(this.charts)) {
      chart.options.scales.x.grid.color = css('--line');
      chart.options.scales.x.ticks.color = css('--text-faint');
      chart.options.scales.y.ticks.color = css('--text-2');
    }
    this.render();
  }

  _renderTable(labels, rows) {
    this.tbody.replaceChildren(...labels.map((op, i) => {
      const tr = document.createElement('tr');
      const r = rows[i];
      for (const v of [op, `${r.balance > 0 ? '+' : ''}${r.balance}`, r.fuel.toFixed(2), String(r.dodges)]) {
        const td = document.createElement('td');
        td.textContent = v;
        tr.append(td);
      }
      return tr;
    }));
  }

  _row(op) {
    if (!this.ops.has(op)) this.ops.set(op, { balance: 0, fuel: 0, dodges: 0 });
    return this.ops.get(op);
  }

  _setLast(text) {
    this.last.textContent = text;
    this.last.hidden = !text;
  }

  _build() {
    const make = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text) n.textContent = text;
      return n;
    };

    const head = make('div', 'row');
    head.style.cssText = 'justify-content: space-between; align-items: baseline; margin-bottom: var(--sp-3)';
    head.append(make('span', 'eyebrow', 'Fairness ledger'), make('span', 'illustrative'));

    this.empty = make('p', 'faint', 'Operators appear here once an encounter is loaded.');
    this.empty.style.cssText = 'font-size: 12.5px; margin: 0';

    this.last = make('p', 'ledger__last');
    this.last.setAttribute('aria-live', 'polite');
    this.last.hidden = true;

    this.canvases = {};
    this.wraps = {};
    const sections = [];
    const titles = { balance: 'Credit balance', fuel: 'Fuel spent \u00b7 \u0394v m/s', dodges: 'Dodges absorbed' };
    if (this.hasChart) {
      for (const key of ['balance', 'fuel', 'dodges']) {
        const sec = make('section', 'ledger__section');
        const wrap = make('div', 'ledger__chart');
        const canvas = document.createElement('canvas');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `${titles[key]} per operator. Values are in the table below.`);
        wrap.append(canvas);
        sec.append(make('span', 'ledger__title', titles[key]), wrap);
        this.canvases[key] = canvas;
        this.wraps[key] = wrap;
        sections.push(sec);
      }
    }

    // Always present: visible when there's no Chart.js, screen-reader-only otherwise.
    const table = make('table', this.hasChart ? 'matrix sr-only' : 'matrix');
    const thead = make('thead');
    const hr = make('tr');
    for (const h of ['Operator', 'Credit', '\u0394v m/s', 'Dodges']) hr.append(make('th', '', h));
    thead.append(hr);
    this.tbody = make('tbody');
    table.append(thead, this.tbody);

    const foot = make('p', 'faint',
      'Fungi cut off partners that stop trading back. The ledger borrows that idea, ' +
      'without the part where starving a neighbour is acceptable.');
    foot.style.cssText = 'font-size: 11.5px; line-height: 1.55; margin: var(--sp-4) 0 0';

    this.panel.replaceChildren(head, this.empty, this.last, ...sections, table, foot);
  }
}

/* Round an axis maximum up to a tidy number, never below `floor`. */
function niceMax(v, floor) {
  const target = Math.max(v * 1.15, floor);
  const mag = 10 ** Math.floor(Math.log10(target));
  const unit = 0.4 * mag;           // quarters of this land on round numbers
  return Math.ceil(target / unit) * unit;
}

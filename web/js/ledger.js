// Fairness ledger tab: opening balances until the burn is executed, then the episode's ledger_after.
import { store } from './state.js';
import { currentEpisode, currentSteps } from './playback.js';
import { executedBy } from './playbackCore.js';
import { bars, isBalanced, openingBalances } from './ledgerMath.js';
import { h, clear, $ } from './dom.js';
import { signed } from './format.js';

function render() {
  const ep = currentEpisode();
  const panel = $('#panel-ledger');
  if (!ep || !panel) return;
  const steps = currentSteps();
  const i = store.get('stepIndex');
  const done = executedBy(steps, i) || i >= steps.length - 1;
  const balances = done && Object.keys(ep.outcome.ledger_after).length ? ep.outcome.ledger_after : openingBalances(ep.agents);
  clear(panel);
  panel.append(
    h('div', { class: 'panel-title', text: 'Fairness ledger · illustrative' }),
    h('p', { class: 'small', style: { margin: 0, color: 'var(--text-2)' }, text: 'Yielding earns credit, paid by whoever benefited (debris owners pay for their debris). Silence and false declarations cost credit.' }),
    h('div', { class: 'small muted', text: done ? 'After this event' : 'Before this event' }),
  );
  for (const r of bars(balances)) {
    const fill = h('i', { style: { width: `${r.widthPct}%`, left: r.side === 'pos' ? '50%' : `${50 - r.widthPct}%`, background: r.side === 'pos' ? 'var(--cls-autonomous)' : 'var(--warn-strong)' } });
    panel.append(h('div', { class: 'bar-row' },
      h('span', { text: r.operator }),
      h('div', { class: 'bar center' }, fill),
      h('span', { class: `bar-val ${r.side}`, text: signed(r.value, 2) })));
  }
  const commons = balances.commons ?? 0;
  panel.append(h('div', { class: 'bar-row' }, h('span', { class: 'muted', text: 'Commons fund' }), h('span', {}), h('span', { class: 'bar-val', text: signed(commons, 2) })));
  panel.append(h('span', { class: `badge ${isBalanced(balances) ? 'ok' : 'warn'}`, text: isBalanced(balances) ? 'balances sum to zero ✓' : 'balance check failed' }));
  const dv = Object.entries(ep.outcome.dv_ms).filter(([, v]) => v > 0);
  if (done && dv.length) {
    panel.append(h('div', { class: 'small muted', text: `Fuel spent: ${dv.map(([id, v]) => `${ep.agents.find((a) => a.id === id)?.name ?? id} ${v} m/s`).join(', ')}` }));
  }
}

export function init() {
  ['change:stepIndex', 'change:episodeId', 'change:variant', 'change:branch'].forEach((e) => store.on(e, render));
  render();
}

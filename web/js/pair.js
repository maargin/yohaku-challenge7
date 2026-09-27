// Pick two real catalogue objects; the simulator on the server decides the encounter and Mission Control plays it.
import { store } from './state.js';
import { h, $ } from './dom.js';
import { validate } from './validate.js';
import { addEpisode, select } from './events.js';
import { play } from './playback.js';
import { positionOf } from './globe.js';

export function init() {
  const card = $('#pair-card');
  const live = store.get('live') ?? {};
  if (!card || !live.pair) return;
  const objects = store.get('data').objects ?? [];
  const byName = new Map(objects.map((o) => [o.name, o]));
  const list = $('#pair-objects');
  objects.forEach((o) => list.append(h('option', { value: o.name, text: `${o.class} · ${o.operator}` })));
  card.hidden = false;
  const status = $('#pair-status');
  const btn = $('#pair-run');
  $('#pair-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = byName.get($('#pair-a').value.trim());
    const b = byName.get($('#pair-b').value.trim());
    if (!a || !b || a.id === b.id) { status.textContent = 'Pick two different objects from the list.'; return; }
    const miss = Math.min(3000, Math.max(0, Number($('#pair-miss').value) || 80));
    btn.disabled = true;
    status.textContent = 'Asking the simulator…';
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch('api/episode', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: a.id, b: b.id, miss_m: miss }), signal: ctrl.signal, credentials: 'omit' });
      if (!res.ok) throw new Error(String(res.status));
      const ep = validate('episodes', [await res.json()])[0];
      ep.norad = [a.id, b.id];
      ep.site = positionOf(a.id);
      addEpisode(ep);
      select(ep.id);
      status.textContent = `Decided by the simulator at ${new Date().toLocaleTimeString('en-GB')}. Playing on the globe.`;
      play();
    } catch {
      status.textContent = 'The simulator did not answer.';
    } finally {
      clearTimeout(timer);
      btn.disabled = false;
    }
  });
}

// Setup strip on the Encounter page: a preset decided now (browser or simulator) or a worked example.
import { store } from './state.js';
import { h, $ } from './dom.js';
import { episodeIds, findEpisode } from './playbackCore.js';
import { addEpisode, select } from './events.js';
import { play } from './playback.js';
import { PRESETS, runOnServer } from './live.js';
import { createEncounter } from './liveEnv.js';
import { episodeFromRun } from './frames.js';

export function init() {
  const form = $('#setup-form');
  const picker = $('#setup-preset');
  const miss = $('#setup-miss');
  const status = $('#setup-status');
  const btn = $('#setup-run');
  if (!form || !picker || !miss || !status || !btn) return;
  const eps = store.get('data').episodes ?? [];
  picker.append(
    h('optgroup', { label: 'Simulate now' }, ...Object.entries(PRESETS).map(([k, p]) => h('option', { value: `live:${k}`, text: p.title }))),
    h('optgroup', { label: 'Worked examples' }, ...episodeIds(eps).map((id) => h('option', { value: `ep:${id}`, text: (findEpisode(eps, id, 'ai') ?? { title: id }).title }))),
  );
  const current = store.get('episodeId');
  picker.value = current && eps.some((e) => e.id === current) ? `ep:${current}` : `live:${Object.keys(PRESETS)[0]}`;
  const sync = () => {
    const v = picker.value;
    if (v.startsWith('live:')) { miss.disabled = false; miss.value = String(PRESETS[v.slice(5)].m0_m); return; }
    const ep = findEpisode(eps, v.slice(3), 'ai');
    miss.disabled = true;
    if (ep) miss.value = String(Math.round(ep.steps[0].miss_m));
  };
  picker.addEventListener('change', sync);
  sync();
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = picker.value;
    if (v.startsWith('ep:')) {
      select(v.slice(3));
      play();
      status.textContent = 'Playing a worked example decided by the onboard AI.';
      return;
    }
    const key = v.slice(5);
    const preset = PRESETS[key];
    if (!preset) return;
    const spec = { ...preset, m0_m: Math.min(3000, Math.max(0, Number(miss.value) || preset.m0_m)) };
    const live = store.get('live') ?? {};
    btn.disabled = true;
    status.textContent = live.run ? 'Asking the simulator…' : 'Running in your browser…';
    try {
      const rec = (live.run ? await runOnServer(spec) : null) ?? createEncounter(spec).run(store.get('data').policy);
      const ep = episodeFromRun(spec, rec, `live-${key}`);
      addEpisode(ep);
      select(ep.id);
      play();
      status.textContent = rec.source === 'simulator'
        ? `Decided by the simulator on the server at ${new Date().toLocaleTimeString('en-GB')}.`
        : 'Decided in your browser by the same trained network.';
    } catch {
      status.textContent = 'The encounter could not be run.';
    } finally {
      btn.disabled = false;
    }
  });
}

// Event list + scenario picker: one entry per scenario; selecting one resets playback.
import { store } from './state.js';
import { episodeIds, findEpisode } from './playbackCore.js';
import { h, clear, $, $$ } from './dom.js';
import { pcText } from './format.js';
import { pause } from './playback.js';

function peakPc(ep) { return Math.max(...ep.steps.map((s) => s.pc)); }

export function select(id) {
  pause();
  store.set('branch', null);
  store.set('decisions', []);
  store.set('stepIndex', 0);
  store.set('episodeId', id);
}

let renderList = () => {};

function orderedIds(eps) {
  const all = episodeIds(eps);
  return all.filter((id) => id !== 'aeolus-2019').concat(all.includes('aeolus-2019') ? ['aeolus-2019'] : []);
}

// A scenario computed just now (live server): replaces any earlier one with the same id.
export function addEpisode(ep) {
  const data = store.get('data');
  data.episodes = (data.episodes ?? []).filter((e) => e.id !== ep.id).concat([ep]);
  renderList();
}

export function init() {
  const list = $('#events');
  const picker = $('#scenario');
  renderList = () => {
    const eps = store.get('data').episodes ?? [];
    const ids = orderedIds(eps);
    clear(list);
    clear(picker);
    ids.forEach((id, n) => {
      const ep = findEpisode(eps, id, store.get('variant'));
      const current = id === store.get('episodeId');
      list.append(h('button', {
        class: 'event', role: 'listitem', 'aria-current': String(current), 'data-testid': `event-${id}`,
        onClick: () => select(id),
      },
      h('span', { class: 'ev-top' }, h('span', { text: `EVT-${String(n + 1).padStart(3, '0')}` }), h('span', { text: ep.agents.map((a) => a.class).join(' × ') })),
      h('span', { class: 'ev-title', text: ep.agents.map((a) => a.name).join(' × ') }),
      h('span', { class: 'ev-sub', text: `peak Pc ${pcText(peakPc(ep))} · illustrative` })));
      picker.append(h('option', { value: id, text: ep.title, selected: current ? 'selected' : null }));
    });
  };
  picker.addEventListener('change', () => select(picker.value));
  store.on('change:episodeId', renderList);
  store.on('change:variant', renderList);
  $$('[data-variant]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-variant]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const id = store.get('episodeId');
    store.set('variant', b.dataset.variant);
    select(id);
  }));
  const ids = orderedIds(store.get('data').episodes ?? []);
  store.set('episodeId', ids.includes('crewed-vs-commercial') ? 'crewed-vs-commercial' : ids[0]);
  renderList();
}

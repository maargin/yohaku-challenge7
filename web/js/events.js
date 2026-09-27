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

export function init() {
  const eps = store.get('data').episodes ?? [];
  const ids = episodeIds(eps).filter((id) => id !== 'aeolus-2019').concat(episodeIds(eps).includes('aeolus-2019') ? ['aeolus-2019'] : []);
  const list = $('#events');
  const picker = $('#scenario');
  const renderList = () => {
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
  store.set('episodeId', ids.includes('crewed-vs-commercial') ? 'crewed-vs-commercial' : ids[0]);
  renderList();
}

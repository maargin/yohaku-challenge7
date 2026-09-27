// Timeline under the stage: a scrubber over the steps and marks where something happened.
import { store } from './state.js';
import { currentSteps, seek } from './playback.js';
import { h, clear, $ } from './dom.js';
import { markers } from './frames.js';
import { tMinus } from './format.js';

export function init() {
  const scrub = $('#scrub');
  const marks = $('#marks');
  if (!scrub) return;
  const setMax = () => { scrub.max = String(Math.max(0, currentSteps().length - 1)); };
  scrub.addEventListener('input', () => seek(Number(scrub.value)));
  store.on('change:stepIndex', (i) => {
    scrub.value = String(i);
    if (marks) Array.from(marks.children).forEach((c, k) => c.setAttribute('aria-current', String(k === i)));
  });
  const renderMarks = () => {
    if (!marks) return;
    const frames = store.get('frames') ?? [];
    clear(marks);
    marks.style.gridTemplateColumns = `repeat(${Math.max(1, frames.length)}, 1fr)`;
    markers(frames).forEach((m, k) => {
      const cls = [m.esc ? 'esc' : m.burn ? 'burn' : m.msg ? 'msg' : '', m.decision ? 'decision' : ''].filter(Boolean).join(' ');
      const cell = h('button', { type: 'button', class: cls || null, title: `${tMinus(frames[k].t)}${m.burn ? ' · burn' : ''}${m.esc ? ' · escalation' : ''}${m.msg ? ' · messages' : ''}`,
        'aria-label': `Go to ${tMinus(frames[k].t)}`, 'aria-current': String(k === store.get('stepIndex')) });
      cell.addEventListener('click', () => seek(k));
      marks.append(cell);
    });
  };
  ['change:episodeId', 'change:branch', 'change:variant'].forEach((e) => store.on(e, setMax));
  store.on('change:frames', renderMarks);
  setMax();
  renderMarks();
}

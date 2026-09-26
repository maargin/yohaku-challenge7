// Playback clock: advances the current episode step; pauses for human decisions.
import { store } from './state.js';
import { clampIndex, effectiveSteps, findEpisode, needsDecision } from './playbackCore.js';
import { tMinus } from './format.js';
import { $, $$ } from './dom.js';

const BASE_MS = 1200;
let timer = null;

export function currentEpisode() {
  const eps = store.get('data').episodes ?? [];
  return findEpisode(eps, store.get('episodeId'), store.get('variant'));
}

export function currentSteps() {
  return effectiveSteps(currentEpisode(), store.get('branch'));
}

function tick() {
  const steps = currentSteps();
  const i = store.get('stepIndex');
  const step = steps[i];
  const branch = store.get('branch');
  if (needsDecision(step) && !(branch && branch.index === i)) {
    pause();
    store.emit('decision:needed', { index: i, step });
    return;
  }
  if (i >= steps.length - 1) {
    pause();
    store.emit('episode:end', {});
    return;
  }
  store.set('stepIndex', i + 1);
}

export function play() {
  if (timer) return;
  const steps = currentSteps();
  if (store.get('stepIndex') >= steps.length - 1) {
    store.set('branch', null);
    store.set('stepIndex', 0);
  }
  store.set('playing', true);
  timer = setInterval(tick, BASE_MS / store.get('speed'));
}

export function pause() {
  clearInterval(timer);
  timer = null;
  store.set('playing', false);
}

export function restartTimer() {
  if (timer) { pause(); play(); }
}

export function seek(i) {
  store.set('stepIndex', clampIndex(i, currentSteps().length));
}

export function init() {
  const btn = $('#play-toggle');
  btn.addEventListener('click', () => (store.get('playing') ? pause() : play()));
  store.on('change:playing', (p) => { btn.textContent = p ? 'Pause' : 'Play'; btn.setAttribute('aria-label', p ? 'Pause' : 'Play'); });
  $$('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-speed]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    store.set('speed', Number(b.dataset.speed));
    restartTimer();
  }));
  const clock = $('#clock');
  store.on('change:stepIndex', (i) => {
    const s = currentSteps()[i];
    clock.textContent = s ? tMinus(s.t_min) : '';
  });
}

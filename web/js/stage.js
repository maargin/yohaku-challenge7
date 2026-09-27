// Encounter stage: which scenario shows when the page opens, and the frames every visual reads.
import { store } from './state.js';
import { episodeIds } from './playbackCore.js';
import { currentEpisode, currentSteps } from './playback.js';
import { framesFromEpisode } from './frames.js';

export function rebuild() {
  store.set('frames', framesFromEpisode(currentEpisode(), currentSteps()));
}

export function init() {
  const ids = episodeIds(store.get('data').episodes ?? []);
  if (!store.get('episodeId')) store.set('episodeId', ids.includes('crewed-vs-commercial') ? 'crewed-vs-commercial' : (ids[0] ?? null));
  ['change:episodeId', 'change:variant', 'change:branch'].forEach((e) => store.on(e, rebuild));
  rebuild();
}

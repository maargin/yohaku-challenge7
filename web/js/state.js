// Single store + event bus. Views subscribe; they never call each other directly.
export function createStore(initial = {}) {
  const state = { ...initial };
  const listeners = new Map();
  const on = (event, fn) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  };
  const emit = (event, payload) => {
    for (const fn of listeners.get(event) ?? []) fn(payload);
  };
  const get = (key) => state[key];
  const set = (key, value) => {
    const prev = state[key];
    state[key] = value;
    if (prev !== value) emit(`change:${key}`, value);
  };
  return { get, set, on, emit };
}

export const store = createStore({
  data: {}, failed: {}, variant: 'ai', episodeId: null, stepIndex: 0, playing: false, speed: 1,
  branch: null, decisions: [], tab: 'handshake',
});

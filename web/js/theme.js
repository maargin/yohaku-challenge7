// Dark (default) / light theme toggle; remembered per browser when storage is available.
import { store } from './state.js';
import { $ } from './dom.js';

function apply(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const btn = $('#theme-toggle');
  btn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  btn.setAttribute('aria-pressed', String(theme === 'light'));
  store.emit('theme', theme);
}

export function init() {
  let theme = 'dark';
  try { theme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'); } catch { /* storage unavailable */ }
  apply(theme);
  $('#theme-toggle').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('theme', theme); } catch { /* storage unavailable */ }
    apply(theme);
  });
}

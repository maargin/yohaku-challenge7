// Global error boundary (SECURITY-15): log structured details, show a generic message, never expose internals.
import { log } from './log.js';

const GENERIC = 'Something went wrong in this part of the demo. The rest of the page still works.';

export function toast(text = GENERIC) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.style.display = 'none'; }, 6000);
}

export function install() {
  window.addEventListener('error', (e) => {
    log.error('uncaught error', { message: String(e.message || 'unknown'), source: String(e.filename || '').split('/').pop() });
    toast();
  });
  window.addEventListener('unhandledrejection', (e) => {
    log.error('unhandled rejection', { reason: String(e.reason && e.reason.message ? e.reason.message : e.reason) });
    toast();
  });
}

export function guard(name, fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      log.error('view error', { view: name, message: String(err && err.message) });
      toast();
      return undefined;
    }
  };
}

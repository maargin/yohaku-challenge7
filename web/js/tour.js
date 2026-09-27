// Guided tour: highlights one element at a time with a short card. Starts on the first visit; "Tour" restarts it.
import { h, clear, $ } from './dom.js';

let steps = [];
let index = 0;
let card = null;
let target = null;
let lastFocus = null;
const SEEN_KEY = 'tour-seen';

const seen = () => { try { return localStorage.getItem(SEEN_KEY) === '1'; } catch { return false; } };
const markSeen = () => { try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage may be unavailable */ } };

function available() {
  return steps.filter((s) => {
    const el = $(s.target);
    return el && !el.hidden && el.getClientRects().length > 0;
  });
}

function unhighlight() {
  if (target) target.classList.remove('tour-target');
  target = null;
}

function show(list, k) {
  index = Math.max(0, Math.min(list.length - 1, k));
  const step = list[index];
  unhighlight();
  target = $(step.target);
  if (target) {
    target.classList.add('tour-target');
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  clear(card);
  const next = h('button', { type: 'button', class: 'btn btn-primary', 'data-testid': 'tour-next', text: index === list.length - 1 ? 'Done' : 'Next' });
  const back = h('button', { type: 'button', class: 'btn', text: 'Back', disabled: index === 0 ? '' : null });
  const skip = h('button', { type: 'button', class: 'btn', text: 'Skip tour' });
  next.addEventListener('click', () => (index === list.length - 1 ? stop() : show(list, index + 1)));
  back.addEventListener('click', () => show(list, index - 1));
  skip.addEventListener('click', stop);
  card.append(
    h('div', { class: 'tour-kicker', text: `Tour · ${index + 1} of ${list.length}` }),
    h('div', { class: 'tour-title', text: step.title }),
    h('p', { class: 'tour-text', text: step.text }),
    h('div', { class: 'tour-actions' }, back, next, h('span', { class: 'spacer' }), skip),
  );
  card.hidden = false;
  next.focus();
}

function onKey(e) {
  if (card.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); stop(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); const list = available(); if (index < list.length - 1) show(list, index + 1); else stop(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); show(available(), index - 1); }
}

export function start() {
  const list = available();
  if (!list.length || !card) return;
  lastFocus = document.activeElement;
  show(list, 0);
}

export function stop() {
  if (!card) return;
  unhighlight();
  card.hidden = true;
  clear(card);
  markSeen();
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}

// steps: [{ target: '#selector', title, text }]. Targets that are hidden on this page are skipped.
export function init(tourSteps, { auto = true, delayMs = 1200 } = {}) {
  steps = tourSteps;
  card = $('#tour-card') ?? h('div', { class: 'tour-card', id: 'tour-card', role: 'dialog', 'aria-label': 'Guided tour', 'data-testid': 'tour-card', hidden: '' });
  if (!card.parentElement) document.body.append(card);
  document.addEventListener('keydown', onKey);
  const btn = $('#tour-btn');
  if (btn) btn.addEventListener('click', () => (card.hidden ? start() : stop()));
  if (auto && !seen()) setTimeout(start, delayMs);
}

export const ENCOUNTER_STEPS = [
  { target: '#setup-form', title: 'Choose an encounter', text: 'Presets under "Simulate now" are decided right now by the trained onboard AI (in your browser, or by the simulator on the server when it is available). "Worked examples" were decided earlier and replay. Set the predicted miss distance and press Run.' },
  { target: '#pair-card', title: 'Or pick two real objects', text: 'Type two names from the CelesTrak catalogue. The simulator puts them on a hypothetical close pass with their real class and operator and decides how they react.' },
  { target: '#stage .globe-wrap', title: 'The globe: where', text: 'Every dot is a real tracked object, coloured by class (debris, manoeuvrable, autonomous, crewed). The two objects of the current encounter are joined by a risk link that turns from blue to red as the risk rises. When one of them burns, its point jumps off the closing line and is labelled "moved".' },
  { target: '#stage .approach-wrap', title: 'The approach view: how close', text: 'The encounter plane at closest approach, drawn relative to the object that holds course (centre, with its 20 m hard-body circle). The other object slides in along the dashed track as the clock runs. The disc is the tracking uncertainty σ: the true position is somewhere inside it, and it shrinks as the pass nears. A burn pushes the pass point out along the track (orange arrow). Dashed rings give the scale.' },
  { target: '#approach-hud', title: 'The numbers for this step', text: 'Time to closest approach, uncertainty σ, collision probability (illustrative) and predicted miss distance. Watch the miss jump after a burn.' },
  { target: '#timeline', title: 'The timeline', text: 'Play, pause, change speed, or drag to any 10-minute step from T−240 to closest approach. The marks show where something happened: blue for messages, orange for a burn, red for an escalation; an outlined mark is a human decision.' },
  { target: '#pipe', title: 'How the decision is made', text: 'Seven stages, lit for the current step: Sense → Announce → Priority check → AI proposal → Safety layer → Execute → Human. Everything a satellite does passes through all of them.' },
  { target: '[data-stage="sense"]', title: '1 · Sense', text: 'Each satellite watches its most dangerous neighbour: collision probability, tracking uncertainty and predicted miss. "Dangerous" means a manoeuvre is needed.' },
  { target: '[data-stage="announce"]', title: '2 · Announce', text: 'The two satellites exchange short messages: PROPOSE (who I am, my fuel), ACK (I will move), DO-NOT-MOVE (I hold), EXECUTED (burn done), ESCALATE (ask a human). A satellite that never answers is treated as unable to move.' },
  { target: '[data-stage="priority"]', title: '3 · Priority check', text: 'The safety layer decides who must move from shared data, in a fixed order: an object that cannot move never yields, crewed holds, low fuel holds, a free-rider yields, the more capable (autonomous) moves, commercial yields to public good, then a tie-break. The lit pill is the check that decided.' },
  { target: '[data-stage="propose"]', title: '4 · AI proposal', text: 'What each onboard AI proposes, with its confidence over the seven possible actions (hold, small or large opening burn, closing burn, radial burn, request the other to move, escalate).' },
  { target: '[data-stage="safety"]', title: '5 · Safety layer', text: 'Whether the proposal was allowed (✓) or changed (⟲), and why: a satellite without priority cannot burn, closing burns are turned into opening burns, and a yielder that waits past T−60 is made to burn.' },
  { target: '[data-stage="execute"]', title: '6 · Execute', text: 'The burn that was actually made (Δv in m/s) and how the miss distance changes because of it.' },
  { target: '[data-stage="human"]', title: '7 · Human', text: 'When the stakes are high (a crewed vehicle, high risk, a silent counterpart) a dialog asks you to approve, override or stop. The AI cannot switch these triggers off, and your decision is logged with the time.' },
  { target: 'a[href="details.html"]', title: 'Details page', text: 'The worked examples with every panel (AI Brain, Handshake, Explanation, Ledger), the simulator with the working of every step, the 2019 replay, results on 10,000 scenarios, method, governance and sources.' },
];

export const DETAILS_STEPS = [
  { target: '#mission .mc-bar', title: 'Worked examples', text: 'Eight encounters decided by the onboard AI. Pick one, press Play, change the speed.' },
  { target: '#events', title: 'Close approaches', text: 'The list of examples with the two objects and the peak collision probability (illustrative).' },
  { target: '#mission .globe-wrap', title: 'The globe', text: 'Real tracked objects; the two objects of the example are joined by a risk link.' },
  { target: '#mission .tabs', title: 'Four views of the decision', text: 'AI Brain: what the network sees and its action probabilities. Handshake: the messages and the safety-layer decision. Explanation: a plain-language account written by a local language model. Ledger: who earned or paid for the manoeuvre.' },
  { target: '#live', title: 'Simulate', text: 'Set up any two satellites and an encounter; the same network decides every step. Press "Working" on a row to see the inputs, the network output, the physics with its numbers and the safety-layer checks.' },
  { target: '#replay', title: '2019 replay', text: 'The real Aeolus–Starlink 44 near-miss: what happened by email on the left, the same encounter with the handshake and the onboard AI on the right.' },
  { target: '#results', title: 'Results', text: 'How the AI did on 10,000 new scenarios built from real ESA conjunction data, with confidence intervals, against doing nothing and other strategies.' },
  { target: '#governance', title: 'Governance', text: 'Who is responsible when something goes wrong, who approves what the network learns, and what each actor owes.' },
];

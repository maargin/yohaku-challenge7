// 2019 Aeolus replay: email world (scripted variant notes) vs the System's world (AI variant events).
import { store } from './state.js';
import { h, clear, $, $$ } from './dom.js';
import { tMinus } from './format.js';

const EMAIL_DATES = { '-240': '28 Aug', '-180': '29 Aug', '-120': '1 Sep', '-50': '2 Sep' };

function systemItems(ep) {
  const items = [];
  const name = (id) => ep.agents.find((a) => a.id === id)?.name ?? id;
  for (const s of ep.steps) {
    if (s.note) items.push([tMinus(s.t_min), s.note]);
    for (const m of s.messages) {
      if (m.type === 'ACK') items.push([tMinus(s.t_min), `${name(m.from)} agrees to yield: ${m.text}.`]);
      if (m.type === 'EXECUTED' && m.from === s.verdict?.yielder) items.push([tMinus(s.t_min), `${name(m.from)} burns early and small; both sides commit.`]);
    }
  }
  const last = ep.outcome.ledger_after;
  items.push(['Ledger', `Credits recorded for both operators: ${Object.entries(last).filter(([k]) => k !== 'commons').map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}.`]);
  return items.slice(0, 5);
}

let timer = null;
const capitalise = (t) => t.charAt(0).toUpperCase() + t.slice(1);

function play() {
  clearInterval(timer);
  const all = $$('#replay li');
  all.forEach((li) => li.classList.remove('shown'));
  const bar = $('#replay-progress');
  let k = 0;
  const total = all.length;
  const reveal = () => {
    const email = $$('#replay-email li');
    const sys = $$('#replay-system li');
    if (email[k]) email[k].classList.add('shown');
    if (sys[k]) sys[k].classList.add('shown');
    k += 1;
    bar.style.width = `${Math.min(100, (k / Math.max(email.length, sys.length)) * 100)}%`;
    if (k >= Math.max(email.length, sys.length)) clearInterval(timer);
  };
  reveal();
  timer = setInterval(reveal, 3500);
  return total;
}

export function init() {
  const eps = store.get('data').episodes ?? [];
  const email = eps.find((e) => e.id === 'aeolus-2019' && e.variant === 'scripted');
  const sys = eps.find((e) => e.id === 'aeolus-2019' && e.variant === 'ai') ?? eps.find((e) => e.id === 'aeolus-2019' && e.variant === 'rules');
  const le = $('#replay-email');
  const ls = $('#replay-system');
  clear(le);
  clear(ls);
  if (!email || !sys) {
    le.append(h('li', { class: 'shown' }, h('span', { class: 'when', text: '—' }), h('span', { text: 'Replay data unavailable.' })));
    return;
  }
  for (const s of email.steps) if (s.note) le.append(h('li', {}, h('span', { class: 'when', text: EMAIL_DATES[String(s.t_min)] ?? tMinus(s.t_min) }), h('span', { text: capitalise(s.note.replace(/^\d+ \w{3}: /, '')) })));
  le.append(h('li', {}, h('span', { class: 'when', text: 'Outcome' }), h('span', { text: 'Safe — but only because one side acted alone, late, and paid the whole cost.' })));
  for (const [when, text] of systemItems(sys)) ls.append(h('li', {}, h('span', { class: 'when', text: when }), h('span', { text })));
  $('#replay-play').addEventListener('click', play);
}

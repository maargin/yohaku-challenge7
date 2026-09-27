// Live mode: the visitor sets up an encounter and the shipped policy decides it in the browser, step by step,
// behind the same safety layer that produced the published results.
import { store } from './state.js';
import { h, clear, $ } from './dom.js';
import { createEncounter, HOLD } from './liveEnv.js';
import { ACTION_LABELS, pcText, tMinus } from './format.js';

export const PRESETS = {
  'aeolus-2019': { title: '2019: Aeolus and Starlink 44', m0_m: 80, p0_m: 0, sigma0_m: 1500, sigma_min_m: 120,
    agents: [{ name: 'Aeolus', capability: 'manoeuvrable', purpose: 'public_good', fuel: 0.5, ledger: 0, silent: false },
      { name: 'Starlink 44', capability: 'autonomous', purpose: 'commercial', fuel: 0.8, ledger: 0, silent: false }] },
  'debris': { title: 'Satellite versus debris', m0_m: 60, p0_m: 0, sigma0_m: 1200, sigma_min_m: 100,
    agents: [{ name: 'Sat A', capability: 'manoeuvrable', purpose: 'commercial', fuel: 0.6, ledger: 0, silent: false },
      { name: 'Fragment', capability: 'debris', purpose: 'none', fuel: 0, ledger: 0, silent: false }] },
  'crewed': { title: 'Crewed station versus commercial satellite', m0_m: 15, p0_m: 0, sigma0_m: 1000, sigma_min_m: 100,
    agents: [{ name: 'Station', capability: 'crewed', purpose: 'public_good', fuel: 0.4, ledger: 0, silent: false },
      { name: 'Sat B', capability: 'autonomous', purpose: 'commercial', fuel: 0.9, ledger: 0, silent: false }] },
  'low-fuel': { title: 'Cubesat almost out of fuel', m0_m: 90, p0_m: 0, sigma0_m: 1100, sigma_min_m: 110,
    agents: [{ name: 'Cubesat', capability: 'manoeuvrable', purpose: 'public_good', fuel: 0.1, ledger: 0, silent: false },
      { name: 'Sat C', capability: 'manoeuvrable', purpose: 'commercial', fuel: 0.7, ledger: 0, silent: false }] },
  'silent': { title: 'One satellite never answers', m0_m: 70, p0_m: 0, sigma0_m: 1200, sigma_min_m: 100,
    agents: [{ name: 'Sat D', capability: 'manoeuvrable', purpose: 'commercial', fuel: 0.7, ledger: 0, silent: false },
      { name: 'Sat E', capability: 'manoeuvrable', purpose: 'commercial', fuel: 0.7, ledger: 0, silent: true }] },
  'free-rider': { title: 'A free-rider (ledger −4) meets a fair operator', m0_m: 70, p0_m: 0, sigma0_m: 1200, sigma_min_m: 100,
    agents: [{ name: 'Sat F', capability: 'manoeuvrable', purpose: 'commercial', fuel: 0.7, ledger: -4, silent: false },
      { name: 'Sat G', capability: 'manoeuvrable', purpose: 'commercial', fuel: 0.7, ledger: 1, silent: false }] },
};

const CAP_OPTIONS = [['manoeuvrable', 'Manoeuvrable'], ['autonomous', 'Autonomous'], ['crewed', 'Crewed'], ['debris', 'Debris']];
const PUR_OPTIONS = [['public_good', 'Public good'], ['commercial', 'Commercial'], ['none', 'None']];

function field(label, input) {
  return h('label', { class: 'live-field' }, h('span', { class: 'small muted', text: label }), input);
}

function select(id, options, value) {
  return h('select', { id }, ...options.map(([v, t]) => h('option', { value: v, selected: v === value ? '' : null, text: t })));
}

function number(id, value, min, max, stepSize) {
  return h('input', { id, type: 'number', value, min, max, step: stepSize, inputmode: 'decimal' });
}

function agentForm(k, a) {
  const p = `live-${k}-`;
  return h('div', { class: 'card live-agent' },
    h('div', { class: 'panel-title', text: `Satellite ${k + 1}` }),
    field('Name', h('input', { id: `${p}name`, type: 'text', value: a.name, maxlength: 24 })),
    field('Class', select(`${p}cap`, CAP_OPTIONS, a.capability)),
    field('Mission', select(`${p}pur`, PUR_OPTIONS, a.purpose)),
    field('Fuel (0–1)', number(`${p}fuel`, a.fuel, 0, 1, 0.05)),
    field('Ledger balance (−5 to 5)', number(`${p}led`, a.ledger, -5, 5, 0.5)),
    h('label', { class: 'live-check' }, h('input', { id: `${p}silent`, type: 'checkbox', checked: a.silent ? '' : null }), ' Does not answer messages'));
}

function readForm(root) {
  const v = (id) => $(`#${id}`, root).value;
  const num = (id, lo, hi) => Math.min(hi, Math.max(lo, Number(v(id)) || 0));
  const spec = {
    agents: [0, 1].map((k) => ({
      name: (v(`live-${k}-name`) || `Satellite ${k + 1}`).slice(0, 24),
      capability: v(`live-${k}-cap`), purpose: v(`live-${k}-pur`),
      fuel: num(`live-${k}-fuel`, 0, 1), ledger: num(`live-${k}-led`, -5, 5), silent: $(`#live-${k}-silent`, root).checked,
    })),
    m0_m: num('live-miss', -3000, 3000), p0_m: num('live-offset', 0, 500),
    sigma0_m: Math.max(100, num('live-sigma0', 100, 5000)),
  };
  // uncertainty never grows towards closest approach (same clamp as the training environment)
  spec.sigma_min_m = Math.min(spec.sigma0_m, Math.max(30, num('live-sigmamin', 30, 5000)));
  return spec;
}

function fillForm(root, spec) {
  spec.agents.forEach((a, k) => {
    const p = `live-${k}-`;
    $(`#${p}name`, root).value = a.name;
    $(`#${p}cap`, root).value = a.capability;
    $(`#${p}pur`, root).value = a.purpose;
    $(`#${p}fuel`, root).value = a.fuel;
    $(`#${p}led`, root).value = a.ledger;
    $(`#${p}silent`, root).checked = a.silent;
  });
  $('#live-miss', root).value = spec.m0_m;
  $('#live-offset', root).value = spec.p0_m;
  $('#live-sigma0', root).value = spec.sigma0_m;
  $('#live-sigmamin', root).value = spec.sigma_min_m;
}

function verdictText(out, spec) {
  const names = spec.agents.map((a) => a.name);
  const first = out.steps.find((s) => s.iYields.some(Boolean));
  const yielder = first ? names[first.iYields.indexOf(true)] : null;
  const burns = out.steps.flatMap((s, k) => s.dv.map((d, i) => (d > 0 ? { k, i, d, t: s.t } : null)).filter(Boolean));
  const parts = [];
  parts.push(out.collision ? `Collision: closest approach ${out.final.miss.toFixed(0)} m (hard-body radius 20 m).`
    : `Safe: closest approach ${out.final.miss.toFixed(0)} m.`);
  parts.push(yielder ? `Priority: ${yielder} must move; ${names[1 - first.iYields.indexOf(true)]} holds course.`
    : 'Priority: neither object can move (both non-manoeuvrable). Nothing the AI does can change this.');
  if (burns.length) parts.push(`Burns: ${burns.map((b) => `${names[b.i]} ${b.d.toFixed(2)} m/s at ${tMinus(b.t)}`).join('; ')}.`);
  else parts.push('No burn was needed.');
  if (out.human) parts.push(`A human would be asked to confirm (${out.reasons.join(', ')}).`);
  return parts;
}

function stepRow(s, k, names) {
  const cells = [tMinus(s.t), `${s.miss.toFixed(0)} m`, pcText(s.pc)];
  [0, 1].forEach((i) => {
    const conf = Math.round(s.probs[i][s.chosen[i]] * 100);
    const proposed = `${ACTION_LABELS[s.chosen[i]]} (${conf}%)`;
    const changed = s.executed[i] !== s.chosen[i];
    cells.push(proposed, changed ? `${ACTION_LABELS[s.executed[i]]} — ${s.why[i] ?? 'held'}` : (s.executed[i] === HOLD ? '—' : 'as proposed'));
  });
  const burned = s.dv.some((d) => d > 0);
  return h('tr', { class: burned ? 'live-burn' : null, 'data-testid': `live-step-${k}` }, ...cells.map((c, j) => h('td', { text: c, style: j === 0 ? { fontFamily: 'var(--font-mono)' } : {} })));
}

export function init() {
  const root = $('#live');
  const policy = store.get('data').policy;
  if (!root) return;
  const form = $('#live-form', root);
  const out = $('#live-output', root);
  if (!policy) { out.append(h('p', { class: 'muted', text: 'The onboard AI could not be loaded, so live mode is unavailable.' })); return; }
  const preset = select('live-preset', Object.entries(PRESETS).map(([k, p]) => [k, p.title]), 'aeolus-2019');
  const spec0 = PRESETS['aeolus-2019'];
  form.append(
    field('Start from', preset),
    h('div', { class: 'live-grid' }, agentForm(0, spec0.agents[0]), agentForm(1, spec0.agents[1]),
      h('div', { class: 'card' },
        h('div', { class: 'panel-title', text: 'Encounter' }),
        field('Predicted miss distance (m, along track)', number('live-miss', spec0.m0_m, -3000, 3000, 5)),
        field('Perpendicular offset (m)', number('live-offset', spec0.p0_m, 0, 500, 5)),
        field('Tracking uncertainty at T−240 min (m)', number('live-sigma0', spec0.sigma0_m, 100, 5000, 50)),
        field('Tracking uncertainty at closest approach (m)', number('live-sigmamin', spec0.sigma_min_m, 30, 5000, 10)))),
    h('div', { class: 'cta' }, h('button', { type: 'submit', class: 'btn btn-primary', 'data-testid': 'live-run', text: 'Run the AI' })),
  );
  preset.addEventListener('change', () => fillForm(root, PRESETS[preset.value]));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const spec = readForm(root);
    const result = createEncounter(spec).run(policy);
    const names = spec.agents.map((a) => a.name);
    clear(out);
    out.append(
      h('div', { class: `card live-verdict ${result.collision ? 'bad' : 'ok'}`, 'data-testid': 'live-verdict' },
        ...verdictText(result, spec).map((t, i) => h(i === 0 ? 'b' : 'span', { class: i === 0 ? 'verdict-title' : 'small', text: t }))),
      h('div', { class: 'table-wrap' }, h('table', { class: 'results live-table' },
        h('thead', {}, h('tr', {}, ...['Time', 'Miss', 'Collision prob.', `${names[0]} proposes`, 'Safety layer', `${names[1]} proposes`, 'Safety layer']
          .map((t) => h('th', { scope: 'col', text: t })))),
        h('tbody', {}, ...result.steps.map((s, k) => stepRow(s, k, names))))),
      h('p', { class: 'small muted', text: 'Each row is one 10-minute step. "Proposes" is the AI\'s own choice with its confidence; "Safety layer" shows when that choice was changed and why. The plain-language explanation is generated offline for the recorded scenarios and is not available here.' }),
    );
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

/* ============================================================
   Verdict strip (F4 on screen).

   Shows what each side declared, which rung of the ladder
   decided, who moves, and whether both sides agreed.
   Builds DOM with textContent only — no data goes through
   innerHTML.
   ============================================================ */

import { RULES, verifyBothSides } from './rules.js';

const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'style') node.style.cssText = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
};

export function hideVerdict(root) {
  root.hidden = true;
}

/**
 * @param {HTMLElement} root  #verdict-strip
 * @param {object} a  agent from episodes.json (declared data)
 * @param {object} b  agent from episodes.json
 * @returns the verdict, so callers can log or compare it
 */
export function renderVerdict(root, a, b) {
  const { verdict, match } = verifyBothSides(a, b);

  // meta line
  root.querySelector('#verdict-meta').textContent =
    `rule ${verdict.rule} of ${RULES.length} \u00b7 computed from both sides`;

  // DECLARED
  const declared = root.querySelector('#verdict-declared');
  declared.replaceChildren(declaredLine(a), declaredLine(b));

  // LADDER
  const ladder = root.querySelector('#verdict-ladder');
  ladder.replaceChildren(...verdict.trace.map((t, i) => {
    const chip = el('span', { textContent: `${i + 1} ${RULES[i].label}`, title: t.note || t.state });
    if (t.state === 'fired') chip.dataset.fired = 'true';
    else chip.dataset.state = t.state;
    return chip;
  }));

  // VERDICT
  const result = root.querySelector('#verdict-result');
  const byId = (id) => (id === a.id ? a : b);
  const headline = verdict.mover === null
    ? 'Nobody can move \u2014 escalate to a human'
    : `${byId(verdict.mover).name} manoeuvres`;

  const children = [
    el('span', { textContent: headline, style: 'font-size: 17px; font-weight: 600' }),
    el('span', { textContent: verdict.reason, style: 'font-size: 13px; color: var(--text-2)' }),
    agreement(match)
  ];

  const skipped = verdict.trace.filter((t) => t.state === 'skipped');
  if (skipped.length) {
    children.push(el('span', {
      className: 'faint',
      style: 'font-size: 12px',
      textContent: `Skipped: ${skipped.map((t) => `rule ${t.rule} (${t.note.replace(/\.$/, '').toLowerCase()})`).join(', ')}.`
    }));
  }

  result.replaceChildren(...children);
  root.hidden = false;
  return verdict;
}

function declaredLine(d) {
  const parts = [d.class];
  parts.push(d.purpose ? d.purpose : 'purpose not declared');
  if (d.fuel !== undefined && d.fuel !== null) parts.push(`fuel ${Number(d.fuel).toFixed(2)}`);
  if (d.ledger !== undefined && d.ledger !== null) parts.push(`ledger ${d.ledger > 0 ? '+' : ''}${d.ledger}`);
  if (d.silent) parts.push('silent');

  return el('span', { style: 'font-size: 13px' },
    el('span', { textContent: d.name, style: 'font-weight: 600' }),
    el('span', { textContent: ` \u00b7 ${parts.join(' \u00b7 ')}`, style: 'color: var(--text-2)' }));
}

function agreement(match) {
  const color = match ? 'var(--ok)' : 'var(--alert)';
  const wrap = el('span', { style: `display: flex; align-items: center; gap: 7px; font-size: 12px; color: ${color}` });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '15'); svg.setAttribute('height', '15');
  svg.setAttribute('viewBox', '0 0 16 16'); svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', color); svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', match ? 'M3.5 8.5 L6.5 11.5 L12.5 4.5' : 'M4 4 L12 12 M12 4 L4 12');
  svg.append(path);
  wrap.append(svg, document.createTextNode(match
    ? 'Both sides computed this independently from the declared data. Verdicts match.'
    : 'The two sides reached different verdicts. Escalate.'));
  return wrap;
}

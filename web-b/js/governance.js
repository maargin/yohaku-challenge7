/* ============================================================
   Governance sections (F13–16).

   Reads ../docs/governance.md (written by the backend team) and
   fills the four sections. Each section in the file starts with a
   # or ## heading; the heading's words decide where it goes:

     "analogy"                       -> F13 Where the analogy breaks
     "responsib"                     -> F14 Responsibility
     "learn"                         -> F15 Learning governance
     "naretu" / "obligation" / "charter" -> F16 NARETU charter

   Text before the first section heading becomes the intro.
   A top-level # title, if present, replaces the section title.

   If the file is missing, or a section isn't found, the marked
   placeholders stay and the console says so.

   The file is team content from this repository, so its HTML is
   trusted and inserted as rendered by marked.
   ============================================================ */

const ROUTES = [
  { id: 'f16', test: /naretu|obligation|charter/i },
  { id: 'f13', test: /analog/i },
  { id: 'f14', test: /responsib/i },
  { id: 'f15', test: /learn/i }
];
const VERDICTS = new Set(['holds', 'bends', 'breaks']);

export async function loadGovernance(url) {
  const report = { filled: [], missing: [], unmatched: [] };

  let text = null;
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (res.ok) text = await res.text();
  } catch (err) { /* offline or not there yet */ }

  if (!text || !text.trim()) {
    report.missing = ['intro', ...ROUTES.map((r) => r.id)];
    warnPlaceholders(`${url} not found`);
    return report;
  }
  if (typeof marked === 'undefined') {
    report.missing = ['intro', ...ROUTES.map((r) => r.id)];
    warnPlaceholders('markdown library did not load');
    return report;
  }

  const { title, intro, sections } = split(marked.lexer(text));

  if (title) document.getElementById('gov-title').textContent = title;
  if (intro.length) { fill('intro', intro); report.filled.push('intro'); }

  const used = new Set();
  for (const sec of sections) {
    const route = ROUTES.find((r) => r.test.test(sec.heading) && !used.has(r.id));
    if (!route) { report.unmatched.push(sec.heading); continue; }
    used.add(route.id);
    const h3 = document.getElementById(`${route.id}-title`);
    if (h3) h3.textContent = sec.heading;
    const nav = document.querySelector(`[data-gov-nav="${route.id}"]`);
    if (nav) nav.textContent = sec.heading;
    fill(route.id, sec.tokens);
    report.filled.push(route.id);
  }

  report.missing = ['intro', ...ROUTES.map((r) => r.id)].filter((id) => !report.filled.includes(id));
  if (report.unmatched.length) {
    console.warn(`[governance] sections in governance.md with no place on the page: ${report.unmatched.map((h) => `"${h}"`).join(', ')}`);
  }
  if (report.filled.length) console.info(`[governance] filled from governance.md: ${report.filled.join(', ')}`);
  warnPlaceholders();
  return report;
}

/* Split tokens into an optional # title, an intro, and one section per heading. */
function split(tokens) {
  let title = null;
  const intro = [];
  const sections = [];
  const hasH2 = tokens.some((t) => t.type === 'heading' && t.depth === 2);
  const sectionDepth = hasH2 ? 2 : 1;

  for (const t of tokens) {
    if (t.type === 'heading' && t.depth === 1 && sectionDepth === 2 && title === null && !sections.length) {
      title = t.text;
    } else if (t.type === 'heading' && t.depth === sectionDepth) {
      sections.push({ heading: t.text, tokens: [] });
    } else if (sections.length) {
      sections[sections.length - 1].tokens.push(t);
    } else if (t.type !== 'space') {
      intro.push(t);
    }
  }
  return { title, intro, sections };
}

function fill(key, tokens) {
  const body = document.querySelector(`[data-gov="${key}"]`);
  if (!body) return;
  tokens.links = tokens.links || {};
  body.innerHTML = marked.parser(tokens);
  body.removeAttribute('data-placeholder');
  decorate(body);
}

/* Make rendered markdown look like the rest of the page. */
function decorate(root) {
  for (const table of root.querySelectorAll('table')) {
    table.classList.add('matrix');
    if (!table.parentElement.classList.contains('matrix-scroll')) {
      const wrap = document.createElement('div');
      wrap.className = 'matrix-scroll';
      table.replaceWith(wrap);
      wrap.append(table);
    }
  }
  // "holds" / "bends" / "breaks" in a table cell become verdict chips
  for (const cell of root.querySelectorAll('td, th')) {
    const v = cell.textContent.trim().toLowerCase();
    if (VERDICTS.has(v)) {
      cell.textContent = '';
      const chip = document.createElement('span');
      chip.className = 'verdict-chip';
      chip.dataset.v = v;
      chip.textContent = v;
      cell.append(chip);
    }
  }
  for (const a of root.querySelectorAll('a[href^="http"]')) a.rel = 'noopener';
}

function warnPlaceholders(reason) {
  const left = document.querySelectorAll('[data-placeholder]').length;
  if (left) {
    console.warn(`[governance] ${left} block(s) still show placeholder text${reason ? ` (${reason})` : ''}. Do not record the video like this.`);
  }
}

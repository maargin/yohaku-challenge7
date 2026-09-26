// Pure playback logic (Node-testable): episode lookup, human-decision branches, step clamping.
export const HUMAN_LEVELS = new Set(['L0', 'L1', 'L2']);

export function episodeIds(episodes) {
  const seen = [];
  for (const e of episodes) if (e.variant !== 'scripted' && !seen.includes(e.id)) seen.push(e.id);
  return seen;
}

export function findEpisode(episodes, id, variant) {
  return episodes.find((e) => e.id === id && e.variant === variant)
    ?? episodes.find((e) => e.id === id && e.variant === 'rules')
    ?? episodes.find((e) => e.id === id) ?? null;
}

export function needsDecision(step) {
  return Boolean(step && step.escalation && HUMAN_LEVELS.has(step.escalation.level) && step.branches);
}

export function decisionIndex(episode) {
  return episode ? episode.steps.findIndex(needsDecision) : -1;
}

/** Steps as played: the precomputed branch replaces everything after the decision step. */
export function effectiveSteps(episode, branch) {
  if (!episode) return [];
  const steps = episode.steps;
  if (!branch) return steps;
  const s = steps[branch.index];
  const alt = s && s.branches && s.branches[branch.choice];
  if (!alt) return steps;
  return steps.slice(0, branch.index + 1).concat(alt);
}

export function clampIndex(i, length) {
  if (!Number.isFinite(i) || length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(i)));
}

/** All messages up to and including step i, in order. */
export function messagesUpTo(steps, i) {
  const out = [];
  for (let k = 0; k <= Math.min(i, steps.length - 1); k += 1) out.push(...steps[k].messages);
  return out;
}

export function latestVerdict(steps, i) {
  for (let k = Math.min(i, steps.length - 1); k >= 0; k -= 1) if (steps[k].verdict) return steps[k].verdict;
  return null;
}

export function executedBy(steps, i) {
  return messagesUpTo(steps, i).some((m) => m.type === 'EXECUTED');
}

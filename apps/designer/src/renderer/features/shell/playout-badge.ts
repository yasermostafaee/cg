import type { StarterPlayout } from '@cg/shared-ipc';

/**
 * `DESIGNER-FIX-0905` — the landing card's playout BADGE, worded from the derived summary.
 *
 * The five starters differ mainly in what they do on air; this is the comparable line that
 * says so at a glance. One wording rule, one place, so two cards with the same behaviour
 * read the same. A `~` marks a cycle length rounded to the second.
 */
export function playoutBadge(p: StarterPlayout): string {
  const seconds = (n: number): string => `${String(Math.round(n * 10) / 10)} s`;
  const head =
    p.mode === 'loop-cycle'
      ? p.hold === 'timed'
        ? `loops · ${seconds(p.holdSeconds ?? 0)} hold`
        : 'loops · content-driven hold'
      : p.mode === 'auto-out'
        ? p.hold === 'content-driven'
          ? 'content-driven hold'
          : `auto-out after ${seconds(p.holdSeconds ?? 0)}`
        : p.hasOutPoint
          ? 'holds until stopped, then exits'
          : 'stays until stopped';
  return p.nestedCycleSeconds === undefined
    ? head
    : `${head} · loops every ~${String(Math.round(p.nestedCycleSeconds))} s`;
}

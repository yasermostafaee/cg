import type { LifecycleState } from './types.js';

/**
 * State transitions per Phase 4 §1 / Phase 5 §5.
 *
 *   pending → playing → on-air → exiting → stopped → playing → ...
 *   exiting → playing  (a play() SUPERSEDES an in-flight exit — see below)
 *   any → removed (terminal)
 *
 * In M3.2-α `playing` and `exiting` are instantaneous (no animation yet),
 * so transitions appear synchronous. The state machine still tracks them
 * because M3.2-β's animation phase will hold those states for the full
 * duration of the GSAP timeline.
 *
 * ⭐ `exiting → playing` (session Z, 2026-08-13). D-105 made that prophecy true:
 * `exiting` is now a state the runtime SITS IN for as long as the background outro
 * takes (seconds — the whole `[outPoint → active.out]` segment). `play()` during it
 * is an ordinary operator move, and the runtime has always implemented it as a
 * SUPERSEDE: it bumps `exitGen` so the exit's continuation bails, clears the outro
 * ledger, restores the content and re-cascades `play()` into every controller — the
 * graphic really does come back on air. This table alone still said the move was
 * illegal, so `transition('playing')` returned false, `play()` discarded the boolean,
 * and the machine stayed in `exiting` while the stage played. `stop()`/`out()` guard
 * on `on-air`/`playing`, so from that moment BOTH were silent no-ops for the life of
 * the runtime — the owner's dead Preview buttons, cleared only by a rebuild. The
 * table now models the move the runtime performs.
 */
const TRANSITIONS: Record<LifecycleState, ReadonlySet<LifecycleState>> = {
  pending: new Set(['playing', 'removed']),
  playing: new Set(['on-air', 'exiting', 'removed']),
  'on-air': new Set(['exiting', 'removed', 'playing']),
  exiting: new Set(['stopped', 'playing', 'removed']),
  stopped: new Set(['playing', 'removed']),
  removed: new Set(),
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return TRANSITIONS[from].has(to);
}

export class LifecycleStateMachine {
  private current: LifecycleState = 'pending';

  get state(): LifecycleState {
    return this.current;
  }

  transition(to: LifecycleState): boolean {
    if (!canTransition(this.current, to)) return false;
    this.current = to;
    return true;
  }

  /**
   * Force a transition even when illegal. Reserved for `remove()` which
   * must always succeed regardless of current state.
   */
  forceTransition(to: LifecycleState): void {
    this.current = to;
  }
}

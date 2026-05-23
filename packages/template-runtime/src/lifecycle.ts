import type { LifecycleState } from './types.js';

/**
 * State transitions per Phase 4 §1 / Phase 5 §5.
 *
 *   pending → playing → on-air → exiting → stopped → playing → ...
 *   any → removed (terminal)
 *
 * In M3.2-α `playing` and `exiting` are instantaneous (no animation yet),
 * so transitions appear synchronous. The state machine still tracks them
 * because M3.2-β's animation phase will hold those states for the full
 * duration of the GSAP timeline.
 */
const TRANSITIONS: Record<LifecycleState, ReadonlySet<LifecycleState>> = {
  pending: new Set(['playing', 'removed']),
  playing: new Set(['on-air', 'exiting', 'removed']),
  'on-air': new Set(['exiting', 'removed', 'playing']),
  exiting: new Set(['stopped', 'removed']),
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

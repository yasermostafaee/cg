import { describe, expect, it } from 'vitest';
import {
  isRestorable,
  isRetainedOnAir,
  RetainedAirStateSchema,
  RetainedStackItemSchema,
  StackItemStatusSchema,
  retainedStateFor,
  type RetainedAirState,
} from '../src/runtime/item-state.js';

/**
 * B-107 / B-109 — **the one canonical reconciled-status → retained-state map.**
 *
 * Retention used to reduce a row to `played: boolean`, which collapsed `idle`,
 * `loaded`, `error` and `disconnected` into one value. That is the shared root of
 * three bugs: an errored row came back READY, and a graphic the operator
 * deliberately CLEARed was re-ADDed onto its layer unasked.
 *
 * These specs pin the map itself, because everything downstream is derived from it:
 * the browser's retention store, the bridge's seeding, the offline projection, and
 * the restore's licence to touch a layer.
 */

const ALL_STATUSES = StackItemStatusSchema.options;

describe('retainedStateFor — the canonical map', () => {
  it('is TOTAL: every status the schema admits produces a valid state', () => {
    // The `switch` is exhaustive with no `default`, so this is really a runtime echo
    // of a compile-time guarantee — and that is the point. It fails the moment a new
    // `StackItemStatus` is added without deciding what a restore may do with it,
    // which is the whole class of bug this change closes.
    for (const status of ALL_STATUSES) {
      expect(RetainedAirStateSchema.safeParse(retainedStateFor(status)).success, status).toBe(true);
    }
  });

  it('the AMBIGUOUS statuses still resolve to on-air — over-claiming is the safe direction', () => {
    // Unchanged from the `played` model, deliberately. `exiting` (an out in flight
    // when the bridge died — the CLEAR may never have landed), `unconfirmed` (B-044)
    // and `unverified` (B-086) all describe an item that may well still be rendering.
    // The occupancy check demotes an over-claim to `loaded` the moment the layer
    // proves silent; an UNDER-claim would let a restore treat a LIVE layer as empty,
    // which is the error direction this codebase never takes.
    for (const status of [
      'playing',
      'on-air',
      'updating',
      'exiting',
      'unconfirmed',
      'unverified',
    ] as const) {
      expect(retainedStateFor(status), status).toBe('on-air');
    }
  });

  it('THE FIX: idle, loaded and error are three DIFFERENT states, not one', () => {
    // The defect in one line: these three used to be indistinguishable.
    expect(retainedStateFor('loaded')).toBe('loaded');
    expect(retainedStateFor('idle')).toBe('cleared');
    expect(retainedStateFor('error')).toBe('error');
    expect(new Set(['loaded', 'idle', 'error'].map((s) => retainedStateFor(s as never))).size).toBe(
      3,
    );
  });

  it('`disconnected` maps to loaded — today’s behaviour, preserved and documented', () => {
    // Nothing in the reconciler ever publishes it. It is mapped rather than thrown on
    // because the schema admits it, and `loaded` is what the old `played:false` gave:
    // not an air claim, and the resting status the bridge leaves an item at when no
    // server is reachable (B-082).
    expect(retainedStateFor('disconnected')).toBe('loaded');
  });
});

describe('the derived predicates', () => {
  it('play evidence is DERIVED, and true for exactly one state', () => {
    const onAir = RetainedAirStateSchema.options.filter((s) => isRetainedOnAir(s));
    expect(onAir).toEqual(['on-air']);
  });

  it('🔴 isRestorable — a CLEARED or ERRORED row may NEVER have a producer re-seated', () => {
    // The B-109 predicate. Its name is its contract: a cleared row's layer is empty
    // BECAUSE THE OPERATOR EMPTIED IT, so reading that silence as "a producer was
    // lost, re-ADD it" resurrects a graphic nobody asked for. An errored row never
    // had a producer to lose.
    expect(isRestorable('on-air')).toBe(true);
    expect(isRestorable('loaded')).toBe(true);
    expect(isRestorable('cleared')).toBe(false);
    expect(isRestorable('error')).toBe(false);
  });

  it('every state answers BOTH predicates — neither has a hole a new value could fall into', () => {
    for (const state of RetainedAirStateSchema.options) {
      expect(typeof isRetainedOnAir(state), state).toBe('boolean');
      expect(typeof isRestorable(state), state).toBe('boolean');
    }
  });
});

describe('RetainedStackItemSchema', () => {
  const BASE = { itemId: 'i1', templateId: 't1', fields: {} };

  it('REQUIRES a state — a record without one is not retained intent at all', () => {
    // Load-bearing rather than pedantic: the whole change is that a row's state is
    // never guessed, so a record that does not carry one must fail here rather than
    // be handed a comfortable default downstream.
    expect(RetainedStackItemSchema.safeParse(BASE).success).toBe(false);
    expect(RetainedStackItemSchema.safeParse({ ...BASE, state: 'cleared' }).success).toBe(true);
  });

  it('rejects the RETIRED `played` boolean rather than silently ignoring it', () => {
    // A record written by a build that predates the state field parses to nothing
    // usable — which is what `StackRetentionStore.hydrate` filters on.
    expect(RetainedStackItemSchema.safeParse({ ...BASE, played: true }).success).toBe(false);
  });

  it('carries an optional errorCode, and the OPEN-axis overrides beside it', () => {
    const parsed = RetainedStackItemSchema.parse({
      ...BASE,
      state: 'error' satisfies RetainedAirState,
      errorCode: 'no-layer',
      slot: { channel: 1, layer: 10, server: 'primary' },
    });
    expect(parsed.errorCode).toBe('no-layer');
    expect(parsed.slot?.layer).toBe(10);
    // The two axes: `state` is closed, the overrides are open. Task 6.9d's live-source
    // override lands beside `slot`/`position` and changes nothing here.
    expect(parsed).not.toHaveProperty('played');
  });

  it('an unknown state is REFUSED — the closed axis stays closed', () => {
    expect(RetainedStackItemSchema.safeParse({ ...BASE, state: 'nearly-on-air' }).success).toBe(
      false,
    );
  });
});

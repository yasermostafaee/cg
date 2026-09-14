import type { WebSocket } from 'ws';
import { TEST_LAYER_POLICY } from './support/harness.js';
import { describe, expect, it } from 'vitest';
import { wirePublishes } from '../src/bridge.js';
import { CasparRuntime } from '../src/caspar-runtime.js';

/**
 * 🔴 **`B-247` (§3) — PUBLISH-COVERAGE GUARD: an emitter the runtime DECLARES is an emitter
 * the seam FORWARDS.**
 *
 * ── THE GAP THIS CLOSES, WHICH IS `B-074`'S ONE CLASS OVER ──────────────────
 *
 * `route-coverage.test.ts` guards REQUEST channels: a channel the SPA calls and the bridge
 * never routes answers `unknown channel` and nothing goes red. This is the same hole on the
 * PUSH side, and it is quieter still — an unforwarded emitter produces no error at either end.
 * The bridge computes the event, emits it, and it stops at the seam. Nobody calls anything;
 * nothing answers wrongly; the console simply never learns.
 *
 * That is not hypothetical. `livePlateReleased` — the sentence `releaseLivePlate` composes for
 * every plate the look reconcile lets go, which `multibox-layout-switch` §12.4 calls the thing
 * that makes its teardown fallback *"a NAMED, OBSERVABLE behaviour"* rather than *"a teardown
 * nobody can tell from a bug"* — was declared, emitted at `#applyLivePlatesUnguarded`, and
 * subscribed **only by three tests**, for the life of that change. 19 emitters declared, 18
 * forwarded, and the missing one was the reason a guest's picture left the ledger.
 *
 * ── WHY IT ENUMERATES THE INSTANCE RATHER THAN READING THE SOURCE ───────────
 *
 * 🔴 A grep over `bridge.ts` for `.subscribe(` would count lines, not behaviour, and would be
 * satisfied by a subscription that was commented out inside a branch, or defeated by one
 * spelled differently. This builds a real `CasparRuntime`, finds every field that IS an
 * emitter (structurally — `subscribe` + `emit`, so the guard needs no export of the private
 * `Emitter` class), replaces each `subscribe` with a recording wrapper, and calls the real
 * `wirePublishes`. What it asserts is that the function actually subscribed, which is the
 * property that matters and the only one that cannot drift.
 *
 * ⚠ **The wrapper DELEGATES rather than stubbing.** A `subscribe` that recorded and returned a
 * no-op would let a broken unsubscriber through, and `wirePublishes`'s contract is that its
 * return value tears every subscription down when the socket closes.
 *
 * ⚠ **THE PLANTED RED (PROMPT §3).** Measured, not assumed: commenting out the
 * `backing.rehearseChanged.subscribe(...)` line in `wirePublishes` fails this file with
 * `expected [ 'rehearseChanged' ] to deeply equal []`, and commenting out the
 * `livePlateReleased` line — the defect this guard exists for, replayed — fails it with
 * `expected [ 'livePlateReleased' ] to deeply equal []`. Both were run and both were reverted.
 * A guard that has never failed is a wish.
 */

/** Structural, so the guard needs no export of the runtime-private `Emitter` class. */
interface EmitterLike {
  subscribe: (handler: (value: never) => void) => () => void;
  emit: (value: never) => void;
}

function isEmitter(value: unknown): value is EmitterLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<EmitterLike>;
  return typeof candidate.subscribe === 'function' && typeof candidate.emit === 'function';
}

/**
 * A socket that is never OPEN.
 *
 * `wirePublishes` only touches it inside `push`, which `send()` guards on
 * `readyState === socket.OPEN` — so nothing is ever serialized and no payload has to be
 * manufactured. Subscription happens at wire time and is what this file measures; delivery is
 * every other test's subject.
 */
function closedSocket(): WebSocket {
  return { readyState: 0, OPEN: 1, send: () => undefined } as unknown as WebSocket;
}

/** Every emitter field the runtime declares, and which of them `wirePublishes` subscribed. */
function measure(): { declared: string[]; forwarded: string[]; unforwarded: string[] } {
  // Neither connects nor binds anything — an unstarted runtime is enough, exactly as
  // `route-coverage.test.ts` argues for `buildRoutes`. This test opens no sockets.
  const runtime = new CasparRuntime(
    {
      servers: { A: { host: '127.0.0.1', amcpPort: 5250, oscPort: 6250 } },
      strategy: 'mirror-sync',
      autoFailoverEnabled: false,
    },
    {},
    { layerPolicy: TEST_LAYER_POLICY },
  );

  const declared: string[] = [];
  const forwarded = new Set<string>();
  for (const [name, value] of Object.entries(runtime)) {
    if (!isEmitter(value)) continue;
    declared.push(name);
    const real = value.subscribe.bind(value);
    value.subscribe = (handler) => {
      forwarded.add(name);
      // DELEGATE — see the header: a no-op would hide a broken unsubscriber.
      return real(handler);
    };
  }

  const unsubscribes = wirePublishes(closedSocket(), runtime);
  // The teardown contract, checked in passing: one unsubscriber per subscription.
  expect(unsubscribes.every((u) => typeof u === 'function')).toBe(true);
  for (const off of unsubscribes) off();

  return {
    declared: declared.sort(),
    forwarded: [...forwarded].sort(),
    unforwarded: declared.filter((n) => !forwarded.has(n)).sort(),
  };
}

describe('bridge publish coverage (B-247)', () => {
  it('forwards EVERY emitter CasparRuntime declares', () => {
    const { declared, unforwarded } = measure();

    /*
      The POSITIVE CONTROL, first: a run that enumerated nothing would satisfy the assertion
      below vacuously, and "no emitter is unforwarded" is exactly the shape of claim that is
      void until the instrument is shown live. If the class ever stops declaring emitters as
      own enumerable fields, this fails rather than passing silently.
    */
    expect(declared.length, 'the guard found the emitters at all').toBeGreaterThanOrEqual(19);
    expect(declared, 'the ledger emitter is among them').toContain('liveLayersChanged');
    // The `B-247` emitter itself — named, so a future deletion of the forward is unmistakable.
    expect(declared, 'the release emitter is declared').toContain('livePlateReleased');

    // Named explicitly so a failure says WHICH emitter lost its forward.
    expect(unforwarded).toEqual([]);
  });

  it('declared and forwarded agree, and the count is reported', () => {
    const { declared, forwarded } = measure();
    // One number, asserted two ways: a forward that subscribed something the class does not
    // declare is impossible by construction here, so equality of the SETS is the whole claim.
    expect(forwarded).toEqual(declared);
  });
});

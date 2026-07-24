import { describe, expect, it } from 'vitest';
import {
  AsyncButtonController,
  asyncResultMessage,
  type AsyncView,
} from '../src/renderer/ui/asyncButtonController.js';

/**
 * R-007 — the async-feedback state machine. A manual scheduler stands in for
 * setTimeout so the 150ms spinner-delay and 300ms minimum-visible floor are
 * exercised deterministically.
 */

interface Scheduled {
  fn: () => void;
  at: number;
  cancelled: boolean;
}

class FakeClock {
  now = 0;
  readonly items: Scheduled[] = [];
  schedule = (fn: () => void, ms: number): (() => void) => {
    const item: Scheduled = { fn, at: this.now + ms, cancelled: false };
    this.items.push(item);
    return () => {
      item.cancelled = true;
    };
  };
  /** Advance time, firing due, non-cancelled timers in order. */
  advance(ms: number): void {
    const target = this.now + ms;
    // Fire in due order; new timers scheduled during a fire are included.
    for (;;) {
      const next = this.items
        .filter((i) => !i.cancelled && i.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (next === undefined) break;
      next.cancelled = true; // consume
      this.now = next.at;
      next.fn();
    }
    this.now = target;
  }
}

function harness(): { clock: FakeClock; ctrl: AsyncButtonController; view: () => AsyncView } {
  const clock = new FakeClock();
  let last: AsyncView = {
    phase: 'idle',
    showSpinner: false,
    errorMessage: null,
    ariaBusy: false,
    inFlight: false,
  };
  const ctrl = new AsyncButtonController({
    onChange: (v) => {
      last = v;
    },
    schedule: clock.schedule,
  });
  return { clock, ctrl, view: () => last };
}

const deferred = (): {
  promise: Promise<{ accepted: boolean }>;
  resolve: (a: boolean) => void;
  reject: (e: Error) => void;
} => {
  let resolve!: (a: boolean) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<{ accepted: boolean }>((res, rej) => {
    resolve = (accepted) => res({ accepted });
    reject = rej;
  });
  return { promise, resolve, reject };
};

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('AsyncButtonController', () => {
  it('goes busy on press and guards double-fire', () => {
    const { ctrl, view } = harness();
    const d = deferred();
    ctrl.press(() => d.promise);
    expect(view()).toMatchObject({ phase: 'busy', ariaBusy: true, inFlight: true });
    // A second press while in flight is ignored.
    let secondCalled = false;
    ctrl.press(() => {
      secondCalled = true;
      return deferred().promise;
    });
    expect(secondCalled).toBe(false);
  });

  it('shows NO spinner before 150ms and does not flicker on a fast ack', async () => {
    const { clock, ctrl, view } = harness();
    const d = deferred();
    ctrl.press(() => d.promise);
    clock.advance(100); // still before the spinner delay
    expect(view().showSpinner).toBe(false);
    d.resolve(true);
    await tick();
    // Resolved before 150ms → success, spinner never shown.
    expect(view().showSpinner).toBe(false);
    expect(view().phase).toBe('success');
  });

  it('shows the spinner if still pending at 150ms and holds it ≥300ms', async () => {
    const { clock, ctrl, view } = harness();
    const d = deferred();
    ctrl.press(() => d.promise);
    clock.advance(150);
    expect(view().showSpinner).toBe(true);
    // Resolve at 200ms — only 50ms of spinner shown; it must hold to 450ms.
    clock.advance(50);
    d.resolve(true);
    await tick();
    expect(view().showSpinner).toBe(true); // floor not elapsed yet
    expect(view().phase).toBe('busy');
    clock.advance(250); // now 450ms — floor elapsed
    expect(view().showSpinner).toBe(false);
    expect(view().phase).toBe('success');
  });

  it('flashes success then returns to idle', async () => {
    const { clock, ctrl, view } = harness();
    const d = deferred();
    ctrl.press(() => d.promise);
    d.resolve(true);
    await tick();
    expect(view().phase).toBe('success');
    clock.advance(600);
    expect(view().phase).toBe('idle');
  });

  it('shows an error message on a not-accepted result', async () => {
    const { ctrl, view } = harness();
    const d = deferred();
    ctrl.press(() => d.promise);
    d.resolve(false);
    await tick();
    expect(view()).toMatchObject({ phase: 'error', ariaBusy: false, inFlight: false });
    expect(view().errorMessage).not.toBeNull();
  });

  it('shows the rejection message on a thrown error', async () => {
    const { ctrl, view } = harness();
    const d = deferred();
    ctrl.press(() => d.promise);
    d.reject(new Error('link down'));
    await tick();
    expect(view().phase).toBe('error');
    expect(view().errorMessage).toBe('link down');
  });

  it('allows a new press after an error and clears the message', async () => {
    const { ctrl, view } = harness();
    const first = deferred();
    ctrl.press(() => first.promise);
    first.reject(new Error('boom'));
    await tick();
    expect(view().phase).toBe('error');
    // A fresh press resets to busy with no lingering error.
    const second = deferred();
    ctrl.press(() => second.promise);
    expect(view()).toMatchObject({ phase: 'busy', errorMessage: null, inFlight: true });
  });

  /**
   * B-085 (UX) — with an `onError` sink (a toast), a failure is forwarded there instead of
   * being pinned inline beside the control (which bloated a tight library row). The button
   * returns to idle; the toast carries the message, unchanged.
   */
  function toastHarness(): {
    ctrl: AsyncButtonController;
    view: () => AsyncView;
    errors: string[];
  } {
    const clock = new FakeClock();
    const errors: string[] = [];
    let last: AsyncView = {
      phase: 'idle',
      showSpinner: false,
      errorMessage: null,
      ariaBusy: false,
      inFlight: false,
    };
    const ctrl = new AsyncButtonController({
      onChange: (v) => {
        last = v;
      },
      schedule: clock.schedule,
      onError: (m) => errors.push(m),
    });
    return { ctrl, view: () => last, errors };
  }

  it('routes a thrown error to onError (toast) and returns to idle, not inline', async () => {
    const { ctrl, view, errors } = toastHarness();
    const d = deferred();
    ctrl.press(() => d.promise);
    d.reject(new Error('Bridge disconnected — command rejected. Not sent to CasparCG.'));
    await tick();

    expect(errors).toEqual(['Bridge disconnected — command rejected. Not sent to CasparCG.']);
    expect(view().errorMessage).toBeNull(); // nothing pinned inline
    expect(view().phase).toBe('idle');
    expect(view().inFlight).toBe(false);
  });

  it('routes a not-accepted result to onError too (still no inline message)', async () => {
    const { ctrl, view, errors } = toastHarness();
    const d = deferred();
    ctrl.press(() => d.promise);
    d.resolve(false);
    await tick();

    expect(errors).toHaveLength(1);
    expect(errors[0]).not.toBe('');
    expect(view().errorMessage).toBeNull();
    expect(view().phase).toBe('idle');
  });

  /**
   * R-021 stage 2b (D3) — a CANCELLED confirm gate (see `withConfirm`) must not
   * read as anything: no success flash (nothing ran), no error state and no
   * message (the operator's own "no" is not a refusal). Straight back to idle.
   */
  it('a cancelled result settles straight to idle — no success flash, no message', async () => {
    const { clock, ctrl, view } = harness();
    ctrl.press(() => Promise.resolve({ accepted: false, cancelled: true }));
    await tick();
    expect(view()).toMatchObject({
      phase: 'idle',
      errorMessage: null,
      ariaBusy: false,
      inFlight: false,
    });
    // No pending success timer flips the phase later, either.
    clock.advance(600);
    expect(view().phase).toBe('idle');
  });

  it('a cancelled result with an onError sink (toast) reports NOTHING', async () => {
    const { ctrl, view, errors } = toastHarness();
    ctrl.press(() => Promise.resolve({ accepted: false, cancelled: true }));
    await tick();
    expect(errors).toEqual([]);
    expect(view().phase).toBe('idle');
    expect(view().errorMessage).toBeNull();
  });
});

describe('asyncResultMessage — the shared button/menu wording', () => {
  it('returns null for a cancelled confirm gate (never the not-accepted fallback)', () => {
    expect(asyncResultMessage({ accepted: false, cancelled: true })).toBeNull();
  });

  it('still explains a genuine refusal', () => {
    expect(asyncResultMessage({ accepted: false })).toBe('Not accepted.');
  });
});

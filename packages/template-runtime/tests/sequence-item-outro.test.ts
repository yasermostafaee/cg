import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SequenceDriver } from '../src/sequence-driver.js';

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

function make(repeat: number | 'infinite' = 'infinite') {
  let now = 0;
  let frame: ((time: number) => void) | null = null;
  let finishChild = (): void => undefined;
  const child = new Promise<void>((resolve) => {
    finishChild = resolve;
  });
  const playOutro = vi.fn(() => child);
  const pause = vi.fn();
  const resume = vi.fn();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const driver = new SequenceDriver({
    host,
    direction: 'ltr',
    advance: 'manual',
    repeat,
    defaultDwellMs: 1000,
    transitionIn: 'none',
    transitionOut: 'fade',
    transitionTiming: 'simultaneous',
    transitionMs: 400,
    items: [
      { id: 'a', kind: 'composition', compositionId: 'page' },
      { id: 'b', kind: 'composition', compositionId: 'page' },
    ],
    clock: {
      now: () => now,
      raf: (cb) => {
        frame = cb;
        return 1;
      },
      cancel: () => {
        frame = null;
      },
    },
    renderComposition: ({ id }) => {
      const node = document.createElement('div');
      node.textContent = id;
      return { node, show: () => undefined, hide: () => undefined, pause, resume, playOutro };
    },
  });
  driver.start();
  const advance = (ms: number): void => {
    now += ms;
    const cb = frame;
    frame = null;
    cb?.(now);
  };
  const page = (): HTMLElement => host.firstElementChild as HTMLElement;
  return { driver, advance, page, playOutro, finishChild, pause, resume };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('Sequence held-page content exit', () => {
  it('finishes the final page content once before natural completion and never replays it for parent OUT', async () => {
    const h = make(1);
    let complete = false;
    void h.driver.whenComplete().then(() => {
      complete = true;
    });
    h.driver.next();
    h.advance(400);
    expect(h.playOutro).not.toHaveBeenCalled();
    h.driver.next();
    expect(h.playOutro).toHaveBeenCalledOnce();
    h.advance(1000);
    await flush();
    expect(complete).toBe(false);
    expect(h.page().style.visibility).not.toBe('hidden');
    h.driver.pause();
    h.finishChild();
    await flush();
    h.advance(1000);
    expect(complete).toBe(false);
    h.driver.resume();
    h.advance(200);
    expect(Number(h.page().style.opacity)).toBeCloseTo(0.5);
    h.advance(200);
    await flush();
    expect(complete).toBe(true);
    expect(h.page().style.visibility).toBe('hidden');
    await h.driver.playOutro();
    h.advance(1000);
    expect(h.playOutro).toHaveBeenCalledOnce();
    expect(h.page().style.visibility).toBe('hidden');
    // Existing book repair: Previous after completion is still operable, and that
    // newly shown page owns a fresh external exit instead of reusing the old promise.
    h.driver.previous();
    h.advance(400);
    expect(h.page().style.visibility).not.toBe('hidden');
    const closing = h.driver.playOutro();
    expect(h.playOutro).toHaveBeenCalledTimes(2);
    await flush();
    h.advance(400);
    await closing;
  });

  it('reset during a natural final-item exit cannot complete or close the next run', async () => {
    const h = make(1);
    h.driver.next();
    h.advance(400);
    h.driver.next();
    h.driver.reset();
    h.driver.start();
    let complete = false;
    void h.driver.whenComplete().then(() => {
      complete = true;
    });
    h.finishChild();
    await flush();
    h.advance(2000);
    expect(complete).toBe(false);
    expect(h.page().style.visibility).not.toBe('hidden');
  });

  it('awaits child content once before playing the page exit, without changing page turns', async () => {
    const h = make();
    h.driver.next();
    h.advance(400);
    expect(h.playOutro).not.toHaveBeenCalled();
    const closing = h.driver.playOutro();
    expect(h.driver.playOutro()).toBe(closing);
    expect(h.playOutro).toHaveBeenCalledTimes(1);
    h.advance(2000);
    expect(h.page().style.opacity).toBe('');
    h.finishChild();
    await flush();
    h.advance(200);
    expect(Number(h.page().style.opacity)).toBeCloseTo(0.5);
    h.advance(200);
    await closing;
    expect(h.page().style.visibility).toBe('hidden');
  });

  it('freezes both the child wait and the following owner exit until resumed', async () => {
    const h = make();
    const closing = h.driver.playOutro();
    h.driver.pause();
    h.finishChild();
    await flush();
    h.advance(1000);
    expect(h.page().style.opacity).toBe('');
    expect(h.pause).toHaveBeenCalledOnce();
    h.driver.resume();
    h.advance(200);
    expect(Number(h.page().style.opacity)).toBeCloseTo(0.5);
    h.driver.pause();
    h.advance(1000);
    expect(Number(h.page().style.opacity)).toBeCloseTo(0.5);
    h.driver.resume();
    h.advance(200);
    await closing;
    expect(h.resume).toHaveBeenCalledTimes(2);
  });

  it.each(['reset', 'destroy'] as const)(
    '%s settles pending exit and ignores late child completion',
    async (action) => {
      const h = make();
      const closing = h.driver.playOutro();
      h.driver[action]();
      await closing;
      if (action === 'reset') h.driver.start();
      h.finishChild();
      await flush();
      h.advance(1000);
      expect(h.page().style.visibility).not.toBe('hidden');
      expect(h.playOutro).toHaveBeenCalledOnce();
    },
  );

  it('settles a pending page-exit leg on stop', async () => {
    const h = make();
    const closing = h.driver.playOutro();
    h.finishChild();
    await flush();
    h.advance(200);
    h.driver.stop();
    await closing;
  });
});

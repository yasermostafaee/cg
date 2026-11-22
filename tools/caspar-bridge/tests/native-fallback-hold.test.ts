import { runInNewContext } from 'node:vm';
import { afterEach, expect, it, vi } from 'vitest';
import { NativeFallbackHolds } from '../src/native-fallback-hold.js';

afterEach(() => vi.useRealTimers());

function backgroundPage() {
  vi.useFakeTimers();
  const holds = new NativeFallbackHolds();
  const html = holds.inject('<body></body>', '/t/old?cgpass=background');
  const styles = new Set<{ textContent: string }>();
  const page = { update(_payload: string) {} };
  const script = /<script>([\s\S]+)<\/script>/.exec(html)![1]!;
  runInNewContext(script, {
    window: page,
    setTimeout,
    clearTimeout,
    AbortController,
    CSS: { escape: (s: string) => s },
    requestAnimationFrame: (paint: () => void) => setTimeout(paint, 16),
    document: {
      createElement: () => ({
        textContent: '',
        remove() {
          styles.delete(this);
        },
      }),
      head: { appendChild: (style: { textContent: string }) => styles.add(style) },
    },
    fetch: async (_path: string, request: { body: string }) => {
      const { take, field, index } = JSON.parse(request.body);
      return { ok: holds.accepts(take, field, index) };
    },
  });
  const send = (control: unknown) => page.update(JSON.stringify({ __cg: control }));
  const start = (id: string) => {
    holds.begin(id);
    send({
      presetEffectId: id,
      nativeFallbackHold: true,
      frameTransition: { hideFallbackPlateIds: ['missing-ndi', 'opaque-clip'] },
    });
  };
  return { holds, styles, send, start };
}

it('keeps native-owned fallback hidden past the old page watchdog and releases only its own settled look', async () => {
  const { styles, send, start } = backgroundPage();
  start('first');
  const finish = (id: string) =>
    send({ presetEffectId: id, frameTransition: null, presetTransitionCommit: true });
  finish('first');
  start('next');
  finish('first');
  send({ presetTransitionCommit: true, frameTransition: null });
  await vi.advanceTimersByTimeAsync(5500);
  expect([...styles].map((style) => style.textContent)).toEqual([
    '[data-cg-live-source=missing-ndi] > [data-cg-live-fallback],[data-cg-live-source=opaque-clip] > [data-cg-live-fallback]{visibility:hidden!important}',
  ]);
  finish('next');
  await vi.advanceTimersByTimeAsync(16);
  expect(styles.size).toBe(0);
});

it('restores the author fallback if the native owner disappears before final delivery', async () => {
  const { holds, styles, start } = backgroundPage();
  start('interrupted');
  holds.end('interrupted');
  await vi.advanceTimersByTimeAsync(1200);
  expect(styles.size).toBe(0);
  const html = '<body></body>';
  expect(holds.inject(html, '/t/old?cgpass=foreground')).toBe(html);
  expect(holds.inject(html, '/t/old')).toBe(html);
});

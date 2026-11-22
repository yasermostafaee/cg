import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { FocusArtworkPaints } from '../src/focus-artwork-mixer.js';

describe('first painted focus artwork', () => {
  it('waits for its own applied look, runtime, fonts and two paint callbacks', async () => {
    const staging = new FocusArtworkPaints();
    const cancel = new AbortController();
    const page = staging.expect(
      'http://cg.test/template/one?cgpass=foreground',
      'F2',
      cancel.signal,
    );
    const location = new URL(page.url);
    const markup = staging.inject('<body></body>', location.pathname + location.search);
    const script = /<script>([\s\S]+)<\/script>/.exec(markup)![1]!;
    const ticks: Array<() => void> = [];
    let loaded = false;
    let reported = false;
    const win = { update(_data: string) {} };
    const flush = async () => {
      const tick = ticks.shift();
      if (tick) tick();
      await new Promise((resolve) => setImmediate(resolve));
    };
    runInNewContext(script, {
      window: win,
      document: {
        images: [],
        body: { classList: { contains: () => false } },
        documentElement: { getAttribute: () => (loaded ? '1' : null) },
        fonts: { ready: Promise.resolve() },
      },
      requestAnimationFrame: (cb: () => void) => ticks.push(cb),
      fetch: async (_path: string, request: { body: string }) => {
        const { take, field, index } = JSON.parse(request.body);
        reported = staging.report(take, field, index);
      },
    });
    win.update(JSON.stringify({ __cg: { look: 'F1' } }));
    expect(ticks).toHaveLength(0);
    win.update(JSON.stringify({ __cg: { look: 'F2' } }));
    await flush();
    expect(reported).toBe(false);
    loaded = true;
    await flush();
    await flush();
    expect(reported).toBe(false);
    await flush();
    expect(reported).toBe(true);
    await expect(page.ready).resolves.toBe(true);
    expect(staging.report(location.searchParams.get('cgpaint')!, 'focus-artwork', 0)).toBe(false);
  });

  it('expires a cancelled look and leaves other template pages untouched', async () => {
    const staging = new FocusArtworkPaints();
    const cancel = new AbortController();
    const page = staging.expect('http://cg.test/template/a', 'F1', cancel.signal);
    const token = new URL(page.url).searchParams.get('cgpaint')!;
    const html = '<body></body>';
    expect(staging.inject(html, '/template/b?cgpaint=' + token)).toBe(html);
    expect(staging.report(token, 'book', 0)).toBe(false);
    cancel.abort();
    await expect(page.ready).resolves.toBe(false);
    expect(staging.report(token, 'focus-artwork', 0)).toBe(false);
  });

  it('applies the alpha matte only to the staged page which requested it', () => {
    const staging = new FocusArtworkPaints();
    const cancel = new AbortController();
    const source = 'http://cg.test/template/a?cgpass=foreground';
    const matte = staging.expect(source, 'one', cancel.signal, { matte: true });
    const color = staging.expect(source, 'one', cancel.signal);
    const html = '<html><body>authored artwork</body></html>';
    expect(staging.inject(html, matte.url)).toContain('filter:brightness(0) invert(1)');
    expect(staging.inject(html, color.url)).not.toContain('<style>');
    expect(staging.inject(html, source + '&matte=true')).toBe(html);
    cancel.abort();
    expect(staging.inject(html, matte.url)).toBe(html);
  });

  it('starts two isolated CEF clients together through the Bridge when the matte loads late', async () => {
    const staging = new FocusArtworkPaints();
    const controller = new AbortController();
    const color = staging.expect('http://cg.test/template/a', 'F1', controller.signal);
    const matte = staging.expect(color.url, 'F1', controller.signal, { matte: true });
    let now = 1000;
    const paints: Array<() => void> = [];
    const timers: { at: number; invoke: () => void }[] = [];
    function mount(url: string) {
      const play = vi.fn(() => now);
      const win = { play, update: vi.fn() };
      const ctx = {
        window: win,
        document: {
          documentElement: { getAttribute: () => '1' },
          body: { classList: { contains: () => false } },
          images: [],
          fonts: { ready: Promise.resolve() },
        },
        Date: { now: () => now },
        setTimeout: (invoke: () => void, delay: number) => timers.push({ invoke, at: now + delay }),
        requestAnimationFrame: (cb: () => void) => paints.push(cb),
        fetch: async (_url: string, req: { body: string }) => {
          const { take, field, index, look, clock } = JSON.parse(req.body);
          if (field === 'focus-pair-ready') {
            const state = staging.rendezvous(take, look, clock);
            return { ok: state !== undefined, status: state ? 200 : 404, json: async () => state };
          }
          return { ok: staging.report(take, field, index) };
        },
      };
      const html = staging.inject('<body></body>', url);
      for (const match of html.matchAll(/<script>([\s\S]+?)<\/script>/g))
        runInNewContext(match[1]!, ctx);
      win.play();
      win.update({ __cg: { look: 'F1' } });
      return play;
    }
    const draw = async () => {
      await new Promise((done) => setImmediate(done));
      for (const timer of timers.filter((timer) => timer.at <= now)) {
        timers.splice(timers.indexOf(timer), 1);
        timer.invoke();
      }
      paints.splice(0).forEach((cb) => cb());
    };
    try {
      const visible = mount(color.url);
      await draw();
      now += 3500;
      expect(visible).not.toHaveBeenCalled();
      const mask = mount(matte.url);
      await draw();
      now += 80;
      for (let i = 0; i < 3; i++) await draw();
      expect(mask).not.toHaveBeenCalled();
      now += 80;
      for (let i = 0; i < 7; i++) await draw();
      expect(visible.mock.results).toEqual([{ type: 'return', value: now }]);
      expect(mask.mock.results).toEqual(visible.mock.results);
      await expect(Promise.all([color.ready, matte.ready])).resolves.toEqual([true, true]);
      expect(timers).toHaveLength(0);
    } finally {
      controller.abort();
    }
  });
});

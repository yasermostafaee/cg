// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { createRuntime } from '@cg/template-runtime';
import { countdownStepsScene } from './countdown-steps.js';

describe('countdown starter authored motion coordinates', () => {
  it('keeps the lower-third title, digits and announcement in their own authored positions', () => {
    const scene = countdownStepsScene;
    const entry = scene.compositions?.find((comp) => comp.id === 'comp-countdown-steps-onair');
    if (entry === undefined) throw new Error('Missing countdown entry composition');
    const root = document.createElement('div');
    document.body.appendChild(root);
    const runtime = createRuntime({ ...scene, ...entry }, { root, skipFontLoad: true });
    const positions = {
      'countdown-bg': 0,
      'countdown-title': 34,
      'countdown-clock-bg': 22,
      'countdown-clock': 34,
      'countdown-normal': 104,
      'countdown-zero': 38,
    };
    const yOf = (id: string): number => {
      const node = root.querySelector<HTMLElement>(`[data-cg-element-id="${id}"]`);
      if (node === null) throw new Error(`Missing ${id}`);
      return Number.parseFloat(node.style.top);
    };
    try {
      runtime.tick(0);
      for (const [id, y] of Object.entries(positions))
        expect(yOf(id), `${id} entrance`).toBe(y + 20);
      for (const frame of [20, 80, 100, 116]) {
        runtime.tick(frame);
        for (const [id, y] of Object.entries(positions))
          expect(yOf(id), `${id} frame ${frame}`).toBe(y);
      }
      runtime.tick(130);
      for (const [id, y] of Object.entries(positions)) {
        expect(yOf(id), `${id} outro begins from its own position`).toBeGreaterThan(y);
        expect(yOf(id)).toBeLessThan(y + 16);
      }
      runtime.tick(138);
      for (const [id, y] of Object.entries(positions))
        expect(yOf(id), `${id} outro end`).toBe(y + 16);
    } finally {
      runtime.remove();
      root.remove();
    }
  });

  it('crosses an absolute target, hides digits and stays on air until manual Stop', async () => {
    const scene = countdownStepsScene;
    const onair = scene.compositions?.find((comp) => comp.id === 'comp-countdown-steps-onair');
    if (onair === undefined) throw new Error('Missing Azan lower third');
    const target = scene.fields.find((field) => field.id === 'eventTime');
    if (target?.type !== 'text') throw new Error('Missing absolute target field');
    let now = new Date(target.default ?? '').getTime() - 5000;
    let serial = 0;
    const frames = new Map<number, (time: number) => void>();
    const timers = new Map<number, { due: number; cb: () => void }>();
    const clock = {
      now: () => now,
      raf: (cb: (time: number) => void): number => {
        frames.set(++serial, cb);
        return serial;
      },
      cancel: (id: number): void => {
        frames.delete(id);
      },
      setTimeout: (cb: () => void, delay: number): number => {
        timers.set(++serial, { due: now + delay, cb });
        return serial;
      },
      clearTimeout: (id: unknown): void => {
        timers.delete(id as number);
      },
    };
    const advance = async (ms: number): Promise<void> => {
      for (let elapsed = 0; elapsed < ms; elapsed += 20) {
        now += 20;
        for (const [id, timer] of [...timers]) {
          if (timer.due > now) continue;
          timers.delete(id);
          timer.cb();
        }
        const callbacks = [...frames.values()];
        frames.clear();
        for (const callback of callbacks) callback(now);
        for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
      }
    };
    const root = document.createElement('div');
    document.body.appendChild(root);
    const runtime = createRuntime({ ...scene, ...onair }, { root, skipFontLoad: true, clock });
    let selfEnded = false;
    let stopped = false;
    runtime.on('self-end', () => {
      selfEnded = true;
    });
    runtime.on('stop.end', () => {
      stopped = true;
    });
    try {
      await runtime.play({});
      await advance(3000);
      expect(root.querySelector('[data-cg-clock-time]')?.textContent).not.toBe('');
      await advance(3000);
      expect(root.querySelector('[data-cg-cd0]')?.getAttribute('data-cg-cd0')).toBe('2');
      expect(root.querySelector('[data-cg-clock-time]')?.textContent).toBe('');
      expect(root.querySelector('[data-cg-element-id="countdown-zero"]')?.textContent).toBe(
        'اذان مغرب به افق تهران',
      );
      await advance(10_000);
      expect(selfEnded).toBe(false);
      expect(stopped).toBe(false);
      expect(
        root.querySelector<HTMLElement>('[data-cg-element-id="countdown-bg"]')?.style.opacity,
      ).toBe('1');
      await runtime.stop();
      await advance(1500);
      expect(stopped).toBe(true);
    } finally {
      runtime.remove();
      root.remove();
    }
  });
});

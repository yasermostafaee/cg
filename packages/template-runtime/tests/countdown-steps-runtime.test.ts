import { beforeEach, describe, expect, it } from 'vitest';
import {
  withCgControl,
  type CountdownSteps,
  type Element,
  type FieldValues,
  type Scene,
} from '@cg/shared-schema';
import { createRuntime } from '../src/runtime.js';

/**
 * 🔴 `DELTA-RUN-NEXT-VERSION-01-A` / `-E` / `-F` — a countdown's steps, wired end to end in the page
 * runtime (the same code the Designer preview and both exports boot):
 *
 * - **F** — a step SHOWS or HIDES a composition instance by playing its OWN entrance or exit,
 *   through the nested lifecycle it already has; `Starts hidden` keeps it out until a step cues it;
 *   at Take an instance the current step shows enters WITH the graphic; the graphic's exit takes a
 *   shown instance out by the existing cascade; a fast change uses the engine's own interruption
 *   behaviour; an instance shown by consecutive steps is held across them, not restarted;
 * - **A** — a picture swaps while its step is active and returns when it is left;
 * - **E** — Close the graphic ends a content-driven hold at zero through the existing completion
 *   path (`self-end`, the page's one signal that the bridge answers with `CG <ch>-<layer> STOP 0`
 *   — `template-completion-stop.integration.test.ts` pins that line); Count past zero never does.
 *
 * The instance is observed through its own keyframed element: its opacity ramps f/40 over its
 * 40-frame timeline, so an instance whose controller never ran keeps its BUILT opacity, an entrance
 * moves it up from 0, and an exit (outPoint 20 → 40) moves it from 0.5.
 */

function makeClock() {
  let ms = 0;
  const rafs = new Map<number, (ts: number) => void>();
  const timers: { id: number; due: number; cb: () => void }[] = [];
  let nextId = 1;
  return {
    now: () => ms,
    raf: (cb: (ts: number) => void) => {
      const id = nextId++;
      rafs.set(id, cb);
      return id;
    },
    cancel: (h: number) => {
      rafs.delete(h);
    },
    setTimeout: (cb: () => void, delay: number) => {
      const id = nextId++;
      timers.push({ id, due: ms + delay, cb });
      return id;
    },
    clearTimeout: (h: unknown) => {
      const i = timers.findIndex((t) => t.id === h);
      if (i >= 0) timers.splice(i, 1);
    },
    advance: (delta: number) => {
      ms += delta;
      const due = timers.filter((t) => t.due <= ms).sort((a, b) => a.due - b.due);
      for (const t of due) {
        const i = timers.indexOf(t);
        if (i >= 0) timers.splice(i, 1);
        t.cb();
      }
      const round = [...rafs.entries()];
      for (const [id] of round) rafs.delete(id);
      for (const [, cb] of round) cb(ms);
    },
  };
}
type Clock = ReturnType<typeof makeClock>;

async function run(clock: Clock, totalMs: number, step = 20): Promise<void> {
  for (let t = 0; t < totalMs; t += step) {
    clock.advance(step);
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  }
}

const T = {
  position: { x: 0, y: 0 },
  size: { w: 100, h: 100 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};
const EL = { transform: T, opacity: 1, visible: true, locked: false, zIndex: 0 };

/** A shape whose opacity ramps 0 → 1 over frames [0, 40] (value = f / 40). */
const frame: Element = {
  ...EL,
  id: 'frame',
  name: 'frame',
  type: 'shape',
  shape: 'rect',
  fill: { kind: 'solid', color: '#FF0000' },
  animation: {
    tracks: {
      opacity: {
        keyframes: [
          { frame: 0, value: 0, easing: 'linear' },
          { frame: 40, value: 1, easing: 'linear' },
        ],
      },
    },
  },
} as unknown as Element;

const warning = {
  id: 'w',
  name: 'warning',
  resolution: { width: 100, height: 100 },
  frameRange: { in: 0, out: 40 },
  lifecycle: { outPoint: 20 },
  editorBackdrop: 'transparent',
  layers: [
    {
      id: 'wl',
      name: 'main',
      visible: true,
      locked: false,
      blendMode: 'normal',
      children: [frame],
    },
  ],
};

function countdown(
  ms: number,
  steps: CountdownSteps,
  extra: Record<string, unknown> = {},
): Element {
  return {
    ...EL,
    id: 'cd',
    name: 'cd',
    type: 'clock',
    font: {
      family: 'Vazirmatn',
      weight: 600,
      style: 'normal',
      size: 48,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#ffffff',
    align: 'center',
    verticalAlign: 'middle',
    mode: 'countdown',
    format: 'mm:ss',
    digits: 'latin',
    target: { kind: 'duration', ms },
    steps,
    ...extra,
  } as unknown as Element;
}

const SHOW_AT_60 = (also: unknown[] = []): CountdownSteps =>
  ({
    steps: [
      {
        name: 'Step 1',
        atMs: 60_000,
        changes: [
          { elementId: 'warn', property: 'visible', value: true },
          { elementId: 'logo', property: 'image', value: { assetId: 'a2', source: 'project' } },
          ...also,
        ],
      },
      {
        name: 'At zero',
        atMs: 0,
        changes: [{ elementId: 'warn', property: 'visible', value: false }],
      },
    ],
  }) as CountdownSteps;

function scene(cd: Element, extra: Record<string, unknown> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 's',
    name: 's',
    templateType: 'custom',
    resolution: { width: 1920, height: 1080 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 10 },
    editorBackdrop: 'transparent',
    layers: [
      {
        id: 'L',
        name: 'main',
        visible: true,
        locked: false,
        blendMode: 'normal',
        children: [
          cd,
          {
            ...EL,
            id: 'logo',
            name: 'logo',
            type: 'image',
            assetId: 'a1',
            source: 'project',
            fit: 'contain',
            preserveAspect: true,
          },
          {
            ...EL,
            id: 'warn',
            name: 'warn',
            type: 'composition',
            compositionId: 'w',
            startsHidden: true,
          },
        ],
      },
    ],
    compositions: [warning],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
    ...extra,
  } as unknown as Scene;
}

const ASSETS = { a1: 'data:image/png;base64,one', a2: 'data:image/png;base64,two' };

const warnEl = (): HTMLElement =>
  document.querySelector<HTMLElement>('[data-cg-element-id="warn"]') as HTMLElement;
const frameOpacity = (): number =>
  parseFloat(
    document.querySelector<HTMLElement>('[data-cg-element-id="warn"] [data-cg-element-id="frame"]')
      ?.style.opacity ?? 'NaN',
  );
const logoSrc = (): string | null =>
  document.querySelector<HTMLImageElement>('img[data-cg-element-id="logo"]')?.getAttribute('src') ??
  null;

async function boot(s: Scene): Promise<{ rt: ReturnType<typeof createRuntime>; clock: Clock }> {
  const clock = makeClock();
  const rt = createRuntime(s, { skipFontLoad: true, clock, assetUrls: ASSETS });
  await rt.ready;
  return { rt, clock };
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.body.className = '';
});

describe('🔴 -F — Starts hidden, and a step shows it by playing its OWN entrance', () => {
  it('starts hidden: hidden before any Take, and the Take does not play it', async () => {
    const { rt, clock } = await boot(scene(countdown(120_000, SHOW_AT_60())));
    expect(warnEl().style.visibility).toBe('hidden');
    await rt.play({});
    const before = frameOpacity();
    await run(clock, 600);
    expect(warnEl().style.visibility).toBe('hidden');
    expect(frameOpacity()).toBe(before); // its controller never ran
  });

  it('Step 1 shows it — its entrance plays — and At zero hides it — its exit plays, then it is gone', async () => {
    const { rt, clock } = await boot(scene(countdown(120_000, SHOW_AT_60())));
    await rt.play({});
    await run(clock, 600); // the graphic's entrance; the countdown starts at its content start
    await run(clock, 58_000, 200); // still above 60 s remaining
    expect(warnEl().style.visibility).toBe('hidden');
    // Walk the crossing finely: the instance appears on the frame the step is entered…
    let waited = 0;
    while (warnEl().style.visibility === 'hidden' && waited < 4_000) {
      await run(clock, 20);
      waited += 20;
    }
    expect(warnEl().style.visibility).toBe('');
    const entering = frameOpacity();
    expect(entering).toBeLessThan(0.25);
    await run(clock, 100);
    expect(frameOpacity()).toBeGreaterThan(entering); // …and its own entrance is playing

    await run(clock, 60_000, 200); // zero → At zero hides it
    await run(clock, 1_000);
    expect(warnEl().style.visibility).toBe('hidden');
    expect(frameOpacity()).toBeCloseTo(1, 1); // the exit ran to its last frame (f = 40)
  });

  it('🔴 at Take, an instance the CURRENT step shows enters WITH the graphic', async () => {
    const { rt, clock } = await boot(scene(countdown(30_000, SHOW_AT_60())));
    await rt.play({});
    expect(warnEl().style.visibility).toBe('');
    const first = frameOpacity();
    await run(clock, 200);
    expect(frameOpacity()).toBeGreaterThan(first);
    expect(frameOpacity()).toBeLessThan(0.5); // still in its entrance, from frame 0
  });

  it('the graphic’s exit takes a SHOWN instance out by the existing cascade', async () => {
    const { rt, clock } = await boot(scene(countdown(30_000, SHOW_AT_60())));
    await rt.play({});
    await run(clock, 1_000); // its entrance done: holding at outPoint (0.5)
    expect(frameOpacity()).toBeCloseTo(0.5, 1);
    void rt.stop();
    await run(clock, 200);
    expect(frameOpacity()).toBeGreaterThan(0.5); // its own exit (20 → 40) is playing
  });

  it('a HIDDEN instance plays nothing when the graphic exits — it is not on screen', async () => {
    const { rt, clock } = await boot(scene(countdown(120_000, SHOW_AT_60())));
    await rt.play({});
    await run(clock, 600);
    const before = frameOpacity();
    void rt.stop();
    await run(clock, 600);
    expect(frameOpacity()).toBe(before);
  });

  it('a fast change uses the ENGINE’s own behaviour: a hide in the entrance jumps to the exit and plays it forward; a show in the exit starts the entrance again', async () => {
    const { rt, clock } = await boot(scene(countdown(120_000, SHOW_AT_60())));
    await rt.play({});
    await run(clock, 600);
    rt.rehearseStep('cd', 0); // show
    await run(clock, 100); // ≈ frame 5 of its entrance
    expect(frameOpacity()).toBeLessThan(0.25);
    rt.rehearseStep('cd', 1); // hide, mid-entrance
    await run(clock, 20);
    expect(frameOpacity()).toBeGreaterThanOrEqual(0.5); // jumped to outPoint (f = 20), going on
    rt.rehearseStep('cd', 0); // show again, mid-exit
    await run(clock, 20);
    expect(frameOpacity()).toBeLessThan(0.1); // the entrance again, from frame 0
    expect(warnEl().style.visibility).toBe('');
  });

  it('an instance shown by CONSECUTIVE steps is held across them — never restarted', async () => {
    const steps: CountdownSteps = {
      steps: [
        {
          name: 'Step 1',
          atMs: 60_000,
          changes: [{ elementId: 'warn', property: 'visible', value: true }],
        },
        {
          name: 'Step 2',
          atMs: 30_000,
          changes: [{ elementId: 'warn', property: 'visible', value: true }],
        },
      ],
    };
    const { rt, clock } = await boot(scene(countdown(61_000, steps)));
    await rt.play({});
    await run(clock, 2_000); // shown at Take, entrance done → holding at 0.5
    expect(frameOpacity()).toBeCloseTo(0.5, 1);
    await run(clock, 31_000, 500); // into Step 2
    expect(warnEl().style.visibility).toBe('');
    expect(frameOpacity()).toBeCloseTo(0.5, 1); // not back to frame 0
  });
});

describe('-A — a picture swaps while its step is active', () => {
  it('Step 1 shows the other picture; At zero (which does not set it) returns the authored one', async () => {
    const { rt, clock } = await boot(scene(countdown(30_000, SHOW_AT_60())));
    await rt.play({});
    await run(clock, 200);
    expect(logoSrc()).toBe(ASSETS.a2);
    await run(clock, 31_000, 500);
    expect(logoSrc()).toBe(ASSETS.a1);
  });
});

describe('🔴 -E — Close the graphic ends a content-driven hold through the existing completion path', () => {
  const contentDriven = (afterZero: string): Scene =>
    scene(countdown(2_000, { steps: [] }, { afterZero }), {
      playout: { mode: 'auto-out', holdSource: 'content-driven' },
    });

  it('at zero the graphic leaves by its own exit and the page signals self-end with its take', async () => {
    const { rt, clock } = await boot(contentDriven('close'));
    const ends: (string | undefined)[] = [];
    rt.on('self-end', (e) => ends.push(e.take));
    await rt.play(withCgControl({} as FieldValues, { take: 'take-1' }));
    await run(clock, 4_000, 100);
    expect(ends).toEqual(['take-1']);
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('Count past zero keeps the graphic on air — no exit, no self-end', async () => {
    const { rt, clock } = await boot(contentDriven('count-past'));
    const ends: (string | undefined)[] = [];
    rt.on('self-end', (e) => ends.push(e.take));
    await rt.play(withCgControl({} as FieldValues, { take: 'take-2' }));
    await run(clock, 6_000, 100);
    expect(ends).toEqual([]);
    expect(document.body.classList.contains('cg-pending')).toBe(false);
  });
});

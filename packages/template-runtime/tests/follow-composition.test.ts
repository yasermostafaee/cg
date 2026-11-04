import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * media-phases-follow-composition — the RUNTIME resolution: a `source: 'composition'`
 * element's window is DERIVED from the composition's lifecycle anchors at driver
 * construction (`createRuntime`), so the canvas re-derives on every scene replace
 * (marker drags included) and no surface bakes a copy.
 *
 * D-176 — the media is opaque. A 5 s clip in a 2 s composition with a 1 s entrance and
 * 0.5 s OUT maps to intro `[0 → 1 s]`, middle `[1 → 4.5 s]`, outro `[4.5 → 5 s]`.
 * Stored media markers and legacy holdAt values never participate under Follow.
 */

const { handles } = vi.hoisted(() => ({
  handles: [] as { frames: number[]; destroyed: boolean; el: HTMLElement }[],
}));
// Only the PLAYER is stubbed; the module's pure helpers (`lottieClipMeta`, `lottieTiming`,
// `lottieFollowWindow`) stay REAL so the wiring runs the production derivation.
vi.mock('@cg/lottie-bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof LottieBridge>()),
  createLottiePlayer: (container: HTMLElement) => {
    const h = {
      element: container,
      el: container,
      frames: [] as number[],
      destroyed: false,
      play: () => undefined,
      pause: () => undefined,
      stop: () => undefined,
      destroy() {
        h.destroyed = true;
      },
      goToFrame(f: number) {
        h.frames.push(f);
      },
      get isAlive() {
        return !h.destroyed;
      },
    };
    handles.push(h);
    return h;
  },
}));

const { createRuntime } = await import('../src/runtime.js');

const baseTransform = {
  position: { x: 0, y: 0 },
  size: { w: 400, h: 200 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0, y: 0 },
};

/** The 5 s clip: fr 50, [0 → 250] — clip-second 3 is frame 150. */
const CLIP = { ip: 0, op: 250, fr: 50, w: 400, h: 200, layers: [] };
const lottieAssets = { a: CLIP };

function followLottie(over: Record<string, unknown> = {}): Element {
  return {
    id: 'lot',
    name: 'backdrop',
    type: 'lottie',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: 'a',
    speed: 1,
    loopMode: 'none',
    holdBehavior: 'freeze',
    // Deliberately conflicting legacy values: composition-owned Follow must ignore all of them.
    phases: {
      introEnd: 125,
      outroStart: 180,
      source: 'composition',
      holdAt: 150,
      idle: [140, 160],
    },
    ...over,
  } as unknown as Element;
}

function markedLottie(id: string, introEnd: number): Element {
  return {
    ...(followLottie({ id, name: id }) as object),
    phases: { introEnd, outroStart: 250, source: 'markers' },
  } as Element;
}

function followVideo(over: Record<string, unknown> = {}): Element {
  return {
    id: 'vid',
    name: 'vid-backdrop',
    type: 'video',
    transform: baseTransform,
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    assetId: 'asset-vid',
    durationMs: 5000,
    holdBehavior: 'loop',
    // Deliberately conflicting legacy values: composition-owned Follow must ignore all of them.
    phases: {
      introEnd: 2500,
      outroStart: 3200,
      source: 'composition',
      holdAt: 3000,
      idle: { start: 2800, end: 3000 },
    },
    ...over,
  } as unknown as Element;
}

/** The owner's composition: 2 s at 50 fps, content start 1 s, OUT 0.5 s. */
function scene(children: Element[], over: Record<string, unknown> = {}): Scene {
  return {
    schemaVersion: 1,
    id: 'scene-follow',
    name: 'follow',
    templateType: 'custom',
    resolution: { width: 400, height: 200 },
    frameRate: 50,
    safeAreas: { title: 10, action: 5 },
    frameRange: { in: 0, out: 100 },
    activeRange: { in: 0, out: 100 },
    lifecycle: { outPoint: 75, contentStart: 50 },
    editorBackdrop: 'transparent',
    layers: [
      { id: 'L1', name: 'layer', visible: true, locked: false, blendMode: 'normal', children },
    ],
    fields: [],
    bindings: [],
    fonts: [],
    metadata: { createdAt: '2026-08-13T00:00:00.000Z', updatedAt: '2026-08-13T00:00:00.000Z' },
    ...over,
  } as unknown as Scene;
}

function mount(s: Scene): ReturnType<typeof createRuntime> {
  return createRuntime(s, { skipFontLoad: true, installGlobals: false, lottieAssets });
}

const lastFrame = (): number | undefined => handles[0]?.frames.at(-1);

beforeEach(() => {
  document.body.innerHTML = '';
  document.body.className = '';
  handles.length = 0;
});

describe("the owner's case through the scrub path — intro [0 → 50], middle [50 → 225], outro [225 → 250]", () => {
  it('the playhead drives the derived window, not the stored numbers', () => {
    const r = mount(scene([followLottie()]));
    r.tick(0);
    expect(lastFrame()).toBe(0);
    r.tick(25); // 0.5 s into the entrance
    expect(lastFrame()).toBe(25);
    r.tick(50); // the content start — the hold look lands EXACTLY here
    expect(lastFrame()).toBe(50);
    r.tick(65); // deep in the hold — still the held look
    expect(lastFrame()).toBe(50);
    r.tick(87); // 12 comp frames past the out-point = 240 ms into the OUT segment
    expect(lastFrame()).toBe(237); // session Y: END-anchored outro [225 → 250] — the ending
    r.tick(100); // the active out — the clip's LAST frame, exactly at removal
    expect(lastFrame()).toBe(250);
    expect(Math.min(...handles[0]!.frames)).toBe(0);
    expect(Math.max(...handles[0]!.frames)).toBe(250);
    r.remove();
  });

  it('the poster is the derived H — the held look, painted at build', () => {
    mount(scene([followLottie()]));
    expect(handles[0]!.frames[0]).toBe(50);
  });

  it('legacy media markers and holdAt cannot change the derived window', () => {
    const r = mount(scene([followLottie()]));
    r.tick(0);
    expect(lastFrame()).toBe(0);
    r.tick(50);
    expect(lastFrame()).toBe(50);
    r.tick(100);
    expect(lastFrame()).toBe(250);
    r.remove();
  });
});

describe('re-derivation — dragging a lifecycle marker moves the window with no re-sync step', () => {
  it('moving the out-point re-derives the outro span on the next build', () => {
    const r1 = mount(scene([followLottie()]));
    r1.tick(100);
    expect(lastFrame()).toBe(250); // OUT span 0.5 s ⇒ outro [225 → 250] (session Y)
    r1.remove();
    handles.length = 0;
    // The SAME stored element, a moved marker: outPoint 85 ⇒ OUT span 0.3 s ⇒ outro [235 → 250].
    const r2 = mount(scene([followLottie()], { lifecycle: { outPoint: 85, contentStart: 50 } }));
    r2.tick(90); // 5 comp frames past the new out-point = 100 ms in
    expect(lastFrame()).toBe(240);
    r2.tick(100);
    expect(lastFrame()).toBe(250);
    r2.remove();
  });

  it('moving the content start re-derives the entrance span', () => {
    // contentStart 30 ⇒ the composition-owned intro is clip frames [0 → 30].
    const r = mount(scene([followLottie()], { lifecycle: { outPoint: 75, contentStart: 30 } }));
    r.tick(0);
    expect(lastFrame()).toBe(0);
    r.remove();
  });
});

describe('no circularity — a follower contributes NOTHING to the entrance settle', () => {
  it('the effective content start comes from the OTHER furniture; the follower is null', () => {
    // No content-start marker. A marker'd Lottie settles at 20 comp frames; if the follower
    // voted it would DRAG the heuristic. Correct: holdEntry 20 ⇒ entrance 0.4 s ⇒ the
    // follower's composition-owned intro window is clip frames [0 → 20].
    const s = scene(
      [
        markedLottie('other', 20),
        followLottie({
          // Stored values remain irrelevant and the follower still never votes on settle.
          phases: { introEnd: 125, outroStart: 250, source: 'composition', holdAt: 150 },
        }),
      ],
      { lifecycle: { outPoint: 75 } },
    );
    const r = mount(s);
    const follower = handles[1]!; // built second (document order)
    r.tick(0);
    expect(follower.frames.at(-1)).toBe(0);
    r.remove();
  });
});

describe('no lifecycle — nothing to follow, marker-less behaviour exactly', () => {
  it('the follower behaves as a marker-less clip: whole-clip intro, midpoint poster', () => {
    const r = mount(scene([followLottie()], { lifecycle: undefined }));
    expect(handles[0]!.frames[0]).toBe(125); // the shared midpoint poster, NOT the stored 40
    r.tick(0);
    expect(lastFrame()).toBe(0); // the whole clip is the intro, from ip
    r.tick(60);
    expect(lastFrame()).toBe(60); // …mapped along the playhead (20 ms/frame against fr 50)
    r.remove();
  });
});

describe('the composition-derived middle can loop', () => {
  it('ignores the authored idle range and loops the full derived middle', () => {
    const r = mount(
      scene([followLottie({ holdBehavior: 'idle-loop' })], {
        frameRange: { in: 0, out: 300 },
        activeRange: { in: 0, out: 300 },
        lifecycle: { outPoint: 275, contentStart: 50 },
        playout: { mode: 'manual', holdBehavior: 'loop' },
      }),
    );
    r.tick(0);
    expect(lastFrame()).toBe(0);
    r.tick(60);
    expect(lastFrame()).toBe(60);
    r.tick(240); // 190 frames into a 175-frame middle ⇒ wraps to 65
    expect(lastFrame()).toBe(65);
    r.remove();
  });
});

describe('video follow wiring — the ms-native kind through the same derivation', () => {
  it('Loop receives the composition-derived Hold-entry poster', () => {
    const r = mount(scene([followVideo()], { playout: { mode: 'manual', holdBehavior: 'loop' } }));
    const media = document.querySelector<HTMLVideoElement>('video[data-cg-element-id="vid"]')!;
    // The runtime REFINED the builder's fallback poster to the exact derived H.
    expect(media.dataset['cgPosterMs']).toBe('1000');
    r.remove();
  });

  it('Freeze receives the composition-derived Outro-start poster', () => {
    const r = mount(
      scene([followVideo()], { playout: { mode: 'manual', holdBehavior: 'freeze' } }),
    );
    const media = document.querySelector<HTMLVideoElement>('video[data-cg-element-id="vid"]')!;
    expect(media.dataset['cgPosterMs']).toBe('4500');
    r.remove();
  });

  it('follow without lifecycle leaves the neutral midpoint poster untouched', () => {
    const r = mount(scene([followVideo()], { lifecycle: undefined }));
    const media = document.querySelector<HTMLVideoElement>('video[data-cg-element-id="vid"]')!;
    expect(media.dataset['cgPosterMs']).toBe('2500');
    r.remove();
  });
});

describe('D-135 §5 — a follow-mode video under the playhead: the derived window on the canvas', () => {
  // The first surface where follow's VIDEO half becomes visible. Owner's case, ms-native:
  // 5 s clip, entrance 1 s, OUT 0.5 s ⇒ intro [0 → 1000], middle [1000 → 4500],
  // outro [4500 → 5000]. The default Video behavior loops that derived middle.
  it('tick at the comp content start lands on H; before it, inside the derived intro window', () => {
    const r = mount(scene([followVideo()], { playout: { mode: 'manual', holdBehavior: 'loop' } }));
    const media = document.querySelector<HTMLVideoElement>('video[data-cg-element-id="vid"]')!;
    r.tick(0);
    expect(media.currentTime).toBeCloseTo(0);
    r.tick(25); // 0.5 s into the entrance
    expect(media.currentTime).toBeCloseTo(0.5);
    r.tick(50); // the comp's content start — the entrance settles, the clip is AT H
    expect(media.currentTime).toBeCloseTo(1);
    r.tick(70); // 0.4 s into the composition-derived middle
    expect(media.currentTime).toBeCloseTo(1.4);
    r.tick(75); // the out-point — session Y: the clip's own ENDING begins (the seam jump)
    expect(media.currentTime).toBeCloseTo(4.5);
    r.tick(85); // 0.2 s into the end-anchored outro
    expect(media.currentTime).toBeCloseTo(4.7);
    r.tick(100); // the active out — the clip's LAST moment, exactly at removal
    expect(media.currentTime).toBeCloseTo(5.0);
    // The stored media phase values never leaked into any of this.
    r.remove();
  });
});

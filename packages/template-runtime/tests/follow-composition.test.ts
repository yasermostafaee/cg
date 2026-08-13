import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as LottieBridge from '@cg/lottie-bridge';
import type { Element, Scene } from '@cg/shared-schema';

/**
 * media-phases-follow-composition — the RUNTIME resolution: a `source: 'composition'`
 * element's window is DERIVED from the composition's lifecycle anchors at driver
 * construction (`createRuntime`), so the canvas re-derives on every scene replace
 * (marker drags included) and no surface bakes a copy.
 *
 * The owner's case, verbatim, drives most of these: 5 s clip, hold look at clip-second 3,
 * 2 s composition, content start at 1 s, OUT segment 0.5 s. At comp 50 fps against a clip
 * at `fr` 50 × speed 1, every expected frame is exact: entrance span 1 s ⇒ intro window
 * `[frame 100 → 150]`, hold at 150, OUT span 0.5 s ⇒ outro `[150 → 175]`. Head `[0 → 100]`
 * and tail `[175 → 250]` deliberately unplayed.
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
    // Session Y — the stored numbers are the pre-Y attach SEED SIGNATURE (midpoint 125,
    // op 250): under the corrected rule they derive AS IF ABSENT (a genuinely authored value
    // would now GOVERN the window — the precedence rule), so this fixture models every
    // already-saved follow scene. A test failing with 125/250-shaped intro output has caught
    // the seed masquerading as intent.
    phases: { introEnd: 125, outroStart: 250, source: 'composition', holdAt: 150 },
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
    // The seed signature for the 5 s clip (2500 / 5000) — derives as absent (session Y).
    phases: { introEnd: 2500, outroStart: 5000, source: 'composition', holdAt: 3000 },
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

describe("the owner's case through the scrub path — window [100 → 150] / 150 / outro [225 → 250] (session Y: the clip's ending)", () => {
  it('the playhead drives the derived window, not the stored numbers', () => {
    const r = mount(scene([followLottie()]));
    r.tick(0); // the composition's in-point → the WINDOW start (clip-second 2)
    expect(lastFrame()).toBe(100);
    r.tick(25); // 0.5 s into the entrance
    expect(lastFrame()).toBe(125);
    r.tick(50); // the content start — the hold look lands EXACTLY here
    expect(lastFrame()).toBe(150);
    r.tick(65); // deep in the hold — still the held look
    expect(lastFrame()).toBe(150);
    r.tick(87); // 12 comp frames past the out-point = 240 ms into the OUT segment
    expect(lastFrame()).toBe(237); // session Y: END-anchored outro [225 → 250] — the ending
    r.tick(100); // the active out — the clip's LAST frame, exactly at removal
    expect(lastFrame()).toBe(250);
    // The head [0 → 100] and the static middle [150 → 225] beyond the hold stay unplayed.
    expect(Math.min(...handles[0]!.frames)).toBeGreaterThanOrEqual(100);
    expect(Math.max(...handles[0]!.frames)).toBe(250);
    r.remove();
  });

  it('the poster is the derived H — the held look, painted at build', () => {
    mount(scene([followLottie()]));
    expect(handles[0]!.frames[0]).toBe(150);
  });

  it('absent holdAt degenerates to "play the clip from its head"', () => {
    const r = mount(
      scene([followLottie({ phases: { introEnd: 125, outroStart: 250, source: 'composition' } })]),
    );
    r.tick(0);
    expect(lastFrame()).toBe(0); // intro [0 → 50] — the head, exactly as a manual clip would
    r.tick(50);
    expect(lastFrame()).toBe(50); // H = entrance span
    r.tick(100);
    expect(lastFrame()).toBe(250); // session Y: the outro is the clip's ending [225 → 250]
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
    // contentStart 30 ⇒ entrance 0.6 s ⇒ intro window starts at H − 0.6 s = clip frame 120.
    const r = mount(scene([followLottie()], { lifecycle: { outPoint: 75, contentStart: 30 } }));
    r.tick(0);
    expect(lastFrame()).toBe(120);
    r.remove();
  });
});

describe('no circularity — a follower contributes NOTHING to the entrance settle', () => {
  it('the effective content start comes from the OTHER furniture; the follower is null', () => {
    // No content-start marker. A marker'd Lottie settles at 20 comp frames; if the follower
    // voted it would DRAG the heuristic. Correct: holdEntry 20 ⇒ entrance 0.4 s ⇒ the
    // follower's intro window starts at H − 0.4 s = clip frame 130.
    const s = scene(
      [
        markedLottie('other', 20),
        followLottie({
          // The seed signature (125 / 250) — NOT authored; a genuinely authored introEnd
          // would govern the follower's own window but STILL never votes on the settle.
          phases: { introEnd: 125, outroStart: 250, source: 'composition', holdAt: 150 },
        }),
      ],
      { lifecycle: { outPoint: 75 } },
    );
    const r = mount(s);
    const follower = handles[1]!; // built second (document order)
    r.tick(0);
    expect(follower.frames.at(-1)).toBe(130);
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

describe('an authored idle range composes with H', () => {
  it('the hold idle-loops the authored range while the window is unchanged', () => {
    const r = mount(
      scene([
        followLottie({
          holdBehavior: 'idle-loop',
          phases: {
            introEnd: 125,
            outroStart: 250,
            source: 'composition',
            holdAt: 150,
            idle: [140, 160],
          },
        }),
      ]),
    );
    r.tick(0);
    expect(lastFrame()).toBe(100); // window unchanged
    r.tick(60); // 10 comp frames past the content start = 10 idle frames in
    expect(lastFrame()).toBe(150); // 140 + (60 − 50) % 20
    r.tick(72); // 22 idle frames in → wraps
    expect(lastFrame()).toBe(142); // 140 + (72 − 50) % 20
    r.remove();
  });
});

describe('video follow wiring — the ms-native kind through the same derivation', () => {
  it('the driver receives the derived window: poster refined to H, freeze-at-H hold', () => {
    const r = mount(scene([followVideo()]));
    const media = document.querySelector<HTMLVideoElement>('video[data-cg-element-id="vid"]')!;
    // The runtime REFINED the builder's fallback poster to the exact derived H.
    expect(media.dataset['cgPosterMs']).toBe('3000');
    r.remove();
  });

  it('follow without lifecycle leaves the builder poster (holdAt fallback) untouched', () => {
    const r = mount(scene([followVideo()], { lifecycle: undefined }));
    const media = document.querySelector<HTMLVideoElement>('video[data-cg-element-id="vid"]')!;
    expect(media.dataset['cgPosterMs']).toBe('3000'); // builder wrote holdAt ?? midpoint
    r.remove();
  });
});

describe('D-135 §5 — a follow-mode video under the playhead: the derived window on the canvas', () => {
  // The first surface where follow's VIDEO half becomes visible. Owner's case, ms-native:
  // 5 s clip, holdAt 3000, entrance 1 s, OUT 0.5 s ⇒ intro [2000 → 3000], H 3000, and —
  // session Y — the END-anchored outro [4500 → 5000]: the clip's own ending.
  it('tick at the comp content start lands on H; before it, inside the derived intro window', () => {
    const r = mount(scene([followVideo()]));
    const media = document.querySelector<HTMLVideoElement>('video[data-cg-element-id="vid"]')!;
    r.tick(0); // the comp's IN — the intro window's start, NOT the clip's head
    expect(media.currentTime).toBeCloseTo(2);
    r.tick(25); // 0.5 s into the entrance
    expect(media.currentTime).toBeCloseTo(2.5);
    r.tick(50); // the comp's content start — the entrance settles, the clip is AT H
    expect(media.currentTime).toBeCloseTo(3);
    r.tick(70); // parked at H through the hold (absent idle ⇒ freeze)
    expect(media.currentTime).toBeCloseTo(3);
    r.tick(75); // the out-point — session Y: the clip's own ENDING begins (the seam jump)
    expect(media.currentTime).toBeCloseTo(4.5);
    r.tick(85); // 0.2 s into the end-anchored outro
    expect(media.currentTime).toBeCloseTo(4.7);
    r.tick(100); // the active out — the clip's LAST moment, exactly at removal
    expect(media.currentTime).toBeCloseTo(5.0);
    // The stored seed values (2500 / 5000) never leaked into any of this.
    r.remove();
  });
});

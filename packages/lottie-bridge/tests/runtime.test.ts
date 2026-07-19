import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the lottie_light player before importing the runtime. happy-dom doesn't
// implement Canvas 2D, and lottie_light touches `canvas.getContext('2d')` at
// module init (a transparent-canvas helper). The mock lets us test the wrapper's
// logic without booting the real player. (D-125 switched the bridge from the full
// `lottie-web` build to `lottie-web/build/player/lottie_light`, so the mock path
// follows.)
type Mock = ReturnType<typeof vi.fn>;

interface MockAnim {
  play: Mock;
  pause: Mock;
  stop: Mock;
  destroy: Mock;
  goToAndStop: Mock;
  setSpeed: Mock;
  setDirection: Mock;
  playSegments: Mock;
  addEventListener: Mock;
  removeEventListener: Mock;
  playDirection: 1 | -1;
}

let lastAnim: MockAnim;
let loadAnimationCalls: unknown[][] = [];

function makeAnim(): MockAnim {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    goToAndStop: vi.fn(),
    setSpeed: vi.fn(),
    setDirection: vi.fn(),
    playSegments: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    playDirection: 1,
  };
}

vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: {
    loadAnimation: vi.fn((cfg: unknown) => {
      loadAnimationCalls.push([cfg]);
      lastAnim = makeAnim();
      return lastAnim;
    }),
  },
}));

const { createLottiePlayer } = await import('../src/runtime.js');
const { minimalLottieData } = await import('./fixtures.js');

describe('createLottiePlayer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.appendChild(container);
    loadAnimationCalls = [];
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('returns a handle with the lifecycle methods', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    expect(typeof player.play).toBe('function');
    expect(typeof player.pause).toBe('function');
    expect(typeof player.stop).toBe('function');
    expect(typeof player.destroy).toBe('function');
    expect(typeof player.goToFrame).toBe('function');
    expect(player.element).toBe(container);
    expect(player.isAlive).toBe(true);
  });

  it('calls loadAnimation with the container, svg renderer, and animation data', () => {
    createLottiePlayer(container, minimalLottieData);
    expect(loadAnimationCalls).toHaveLength(1);
    const cfg = loadAnimationCalls[0]?.[0] as Record<string, unknown>;
    expect(cfg['container']).toBe(container);
    expect(cfg['renderer']).toBe('svg');
    expect(cfg['animationData']).toBe(minimalLottieData);
    expect(cfg['autoplay']).toBe(false);
  });

  it('default loopMode = loop → lottie loop: true', () => {
    createLottiePlayer(container, minimalLottieData);
    const cfg = loadAnimationCalls[0]?.[0] as Record<string, unknown>;
    expect(cfg['loop']).toBe(true);
  });

  it('loopMode none → lottie loop: false', () => {
    createLottiePlayer(container, minimalLottieData, { loopMode: 'none' });
    const cfg = loadAnimationCalls[0]?.[0] as Record<string, unknown>;
    expect(cfg['loop']).toBe(false);
  });

  it('loopMode bounce → lottie loop: false + complete listener', () => {
    createLottiePlayer(container, minimalLottieData, { loopMode: 'bounce' });
    const cfg = loadAnimationCalls[0]?.[0] as Record<string, unknown>;
    expect(cfg['loop']).toBe(false);
    expect(lastAnim.addEventListener).toHaveBeenCalledWith('complete', expect.any(Function));
  });

  it('autoplay defaults to false', () => {
    createLottiePlayer(container, minimalLottieData);
    const cfg = loadAnimationCalls[0]?.[0] as Record<string, unknown>;
    expect(cfg['autoplay']).toBe(false);
  });

  it('autoplay: true is passed through', () => {
    createLottiePlayer(container, minimalLottieData, { autoplay: true });
    const cfg = loadAnimationCalls[0]?.[0] as Record<string, unknown>;
    expect(cfg['autoplay']).toBe(true);
  });

  it('speed is set via setSpeed', () => {
    createLottiePlayer(container, minimalLottieData, { speed: 2 });
    expect(lastAnim.setSpeed).toHaveBeenCalledWith(2);
  });

  it('segment is set via playSegments and immediately paused', () => {
    createLottiePlayer(container, minimalLottieData, { segment: [10, 50] });
    expect(lastAnim.playSegments).toHaveBeenCalledWith([10, 50], true);
    expect(lastAnim.pause).toHaveBeenCalled();
  });

  it('segment + autoplay leaves it playing', () => {
    createLottiePlayer(container, minimalLottieData, {
      segment: [10, 50],
      autoplay: true,
    });
    expect(lastAnim.playSegments).toHaveBeenCalledWith([10, 50], true);
    expect(lastAnim.pause).not.toHaveBeenCalled();
  });

  it('play() proxies to anim.play()', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    player.play();
    expect(lastAnim.play).toHaveBeenCalled();
  });

  it('pause() proxies to anim.pause()', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    player.pause();
    expect(lastAnim.pause).toHaveBeenCalled();
  });

  it('stop() proxies to anim.stop()', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    player.stop();
    expect(lastAnim.stop).toHaveBeenCalled();
  });

  it('goToFrame() proxies to anim.goToAndStop(frame, true)', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    player.goToFrame(42);
    expect(lastAnim.goToAndStop).toHaveBeenCalledWith(42, true);
  });

  it('destroy() calls anim.destroy() and flips isAlive', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    player.destroy();
    expect(lastAnim.destroy).toHaveBeenCalledTimes(1);
    expect(player.isAlive).toBe(false);
  });

  it('destroy() is idempotent', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    player.destroy();
    player.destroy();
    expect(lastAnim.destroy).toHaveBeenCalledTimes(1);
  });

  it('destroy() removes the bounce listener', () => {
    const player = createLottiePlayer(container, minimalLottieData, {
      loopMode: 'bounce',
    });
    player.destroy();
    expect(lastAnim.removeEventListener).toHaveBeenCalledWith('complete', expect.any(Function));
  });

  it('lifecycle methods after destroy are no-ops', () => {
    const player = createLottiePlayer(container, minimalLottieData);
    player.destroy();
    lastAnim.play.mockClear();
    lastAnim.pause.mockClear();
    lastAnim.stop.mockClear();
    lastAnim.goToAndStop.mockClear();
    player.play();
    player.pause();
    player.stop();
    player.goToFrame(0);
    expect(lastAnim.play).not.toHaveBeenCalled();
    expect(lastAnim.pause).not.toHaveBeenCalled();
    expect(lastAnim.stop).not.toHaveBeenCalled();
    expect(lastAnim.goToAndStop).not.toHaveBeenCalled();
  });

  it('bounce reverses direction on complete', () => {
    createLottiePlayer(container, minimalLottieData, { loopMode: 'bounce' });
    // Grab the registered listener and invoke it
    const calls = lastAnim.addEventListener.mock.calls;
    const completeCall = calls.find((c: unknown[]) => c[0] === 'complete');
    expect(completeCall).toBeTruthy();
    const listener = completeCall?.[1] as () => void;
    // After playDirection=1, listener should flip to -1 and call play
    listener();
    expect(lastAnim.setDirection).toHaveBeenCalledWith(-1);
    expect(lastAnim.play).toHaveBeenCalled();
  });
});

// — D-125 Phase 3c — applyOverride (text / fill / stroke on named layers) ————

describe('applyOverride', () => {
  /** Attach a fake SVG renderer with named layer elements to the last mock anim. */
  function attachRenderer(
    elements: (Record<string, unknown> | undefined)[],
  ): (Record<string, unknown> | undefined)[] {
    (lastAnim as unknown as Record<string, unknown>)['renderer'] = { elements };
    return elements;
  }

  function textLayer(name: string): {
    el: Record<string, unknown>;
    calls: [Record<string, unknown>, number | undefined][];
  } {
    const calls: [Record<string, unknown>, number | undefined][] = [];
    const el = {
      data: { nm: name },
      updateDocumentData: (d: Record<string, unknown>, i?: number) => {
        calls.push([d, i]);
      },
    };
    return { el, calls };
  }

  function shapeLayer(name: string): { el: Record<string, unknown>; group: HTMLElement } {
    // A stand-in for the SVG <g>: attribute semantics are what the patch relies on.
    const group = document.createElement('div');
    group.innerHTML =
      '<div data-p fill="rgb(1,2,3)"></div>' + // patched
      '<div data-p fill="none"></div>' + // authored hole — kept
      '<div data-p></div>'; // no attr — kept
    return { el: { data: { nm: name }, layerElement: group }, group };
  }

  it('text override reaches the NAMED text layer via updateDocumentData (t only)', () => {
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    const title = textLayer('title');
    const other = textLayer('subtitle');
    attachRenderer([title.el, other.el]);
    expect(h.applyOverride('title', 'text', 'BREAKING')).toBe(true);
    expect(title.calls).toEqual([[{ t: 'BREAKING' }, 0]]);
    expect(other.calls).toHaveLength(0); // addressing is by name — siblings untouched
  });

  it('fill override patches only nodes that CARRY a real fill (holes stay holes)', () => {
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    const { el, group } = shapeLayer('bar');
    attachRenderer([el]);
    expect(h.applyOverride('bar', 'fill', '#00ff00')).toBe(true);
    const nodes = Array.from(group.querySelectorAll('[data-p]'));
    expect(nodes[0]?.getAttribute('fill')).toBe('#00ff00'); // patched
    expect(nodes[1]?.getAttribute('fill')).toBe('none'); // authored hole preserved
    expect(nodes[2]?.hasAttribute('fill')).toBe(false); // untouched
  });

  it('unknown layer / unknown prop / lazy hole / destroyed player are graceful false', () => {
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    const { el } = shapeLayer('bar');
    attachRenderer([undefined, el]); // a lazily-unbuilt hole in elements
    expect(h.applyOverride('missing', 'fill', '#fff')).toBe(false);
    expect(h.applyOverride('bar', 'phases', 'x')).toBe(false); // not an override surface
    h.destroy();
    expect(h.applyOverride('bar', 'fill', '#fff')).toBe(false);
  });

  it('a renderer without elements (shape mismatch) degrades to false, never throws', () => {
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    // No renderer attached at all — the internal access is fully defensive.
    expect(h.applyOverride('any', 'text', 'x')).toBe(false);
  });

  it('fill override ALSO patches the built style data lottie re-stamps from on show() (0-255 c.v)', () => {
    // The wipe bug: lottie re-runs static renderFill with isFirstFrame on a
    // hidden->shown transition (fade-in entrance, replay, idle wrap), re-stamping
    // the AUTHORED colour from itemData.c.v over any DOM-only patch. Patching c.v
    // makes the re-stamp emit the OVERRIDE instead.
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    const { el, group } = shapeLayer('bar');
    const fillData = { c: { v: [255, 0, 0] }, o: {}, style: {} }; // a fill: no `w`
    const strokeData = { c: { v: [1, 2, 3] }, o: {}, w: {}, style: {} }; // a stroke: has `w`
    (el as Record<string, unknown>)['itemsData'] = [{ it: [fillData, strokeData] }];
    attachRenderer([el]);
    expect(h.applyOverride('bar', 'fill', '#00ff00')).toBe(true);
    expect(fillData.c.v).toEqual([0, 255, 0]); // the re-stamp source now holds the override
    expect(strokeData.c.v).toEqual([1, 2, 3]); // prop-addressed: the stroke is untouched
    expect(group.querySelector('[data-p]')?.getAttribute('fill')).toBe('#00ff00'); // DOM too
    expect(h.applyOverride('bar', 'stroke', 'rgb(9, 8, 7)')).toBe(true);
    expect(strokeData.c.v).toEqual([9, 8, 7]);
    expect(fillData.c.v).toEqual([0, 255, 0]);
  });

  it('a text apply forces ONE repaint of the current frame (the frozen-hold case)', () => {
    // updateDocumentData only marks the text dirty; the DOM rebuild happens inside a
    // renderer pass. With the driver frozen there is no next pass — so applyOverride
    // must invalidate the renderer's same-frame early-return and repaint in place.
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    const title = textLayer('title');
    attachRenderer([title.el]);
    const a = lastAnim as unknown as Record<string, unknown>;
    (a['renderer'] as Record<string, unknown>)['renderedFrame'] = 12;
    a['currentFrame'] = 12;
    expect(h.applyOverride('title', 'text', 'LIVE')).toBe(true);
    expect((a['renderer'] as Record<string, unknown>)['renderedFrame']).toBe(-1);
    expect(lastAnim.goToAndStop).toHaveBeenCalledWith(12, true); // same frame — playhead unmoved
  });

  it('a colour apply does NOT force a repaint (the DOM patch is already visible)', () => {
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    const { el } = shapeLayer('bar');
    attachRenderer([el]);
    expect(h.applyOverride('bar', 'fill', '#123456')).toBe(true);
    expect(lastAnim.goToAndStop).not.toHaveBeenCalled();
  });

  it('a matched layer with NO patchable paint reports false (applied is honest)', () => {
    const h = createLottiePlayer(document.createElement('div'), minimalLottieData);
    const group = document.createElement('div');
    group.innerHTML = '<div data-p></div>'; // subtree carries no fill anywhere
    attachRenderer([{ data: { nm: 'empty' }, layerElement: group }]);
    expect(h.applyOverride('empty', 'fill', '#fff')).toBe(false);
  });
});

describe('lottieLayerNames', () => {
  it('lists named top-level layers in authored order with text/shape/other kinds', async () => {
    const { lottieLayerNames } = await import('../src/import.js');
    const data = {
      layers: [
        { ty: 4, nm: 'bar' },
        { ty: 5, nm: 'title' },
        { ty: 4 }, // unnamed — skipped
        { ty: 5, nm: 'sub' },
      ],
    };
    expect(lottieLayerNames(data)).toEqual([
      { name: 'bar', kind: 'shape' },
      { name: 'title', kind: 'text' },
      { name: 'sub', kind: 'text' },
    ]);
  });

  it('malformed data yields []', async () => {
    const { lottieLayerNames } = await import('../src/import.js');
    expect(lottieLayerNames(null)).toEqual([]);
    expect(lottieLayerNames({ layers: 'nope' })).toEqual([]);
  });

  it('non-drawable layers (null / precomp / image / solid) classify for the auto-pick', async () => {
    const { lottieLayerNames } = await import('../src/import.js');
    const data = {
      layers: [
        { ty: 3, nm: 'controller' }, // null — 'other': never an automatic colour pick
        { ty: 0, nm: 'group' }, // precomp — 'other'
        { ty: 2, nm: 'logo' }, // image — 'other'
        { ty: 1, nm: 'backdrop' }, // solid — 'shape' (carries a real paint)
      ],
    };
    expect(lottieLayerNames(data).map((l) => l.kind)).toEqual(['other', 'other', 'other', 'shape']);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock lottie-web before importing the runtime. happy-dom doesn't implement
// Canvas 2D, and the real lottie-web touches `canvas.getContext('2d')` at
// module init. The mock lets us test the wrapper's logic without booting
// the real player.
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

vi.mock('lottie-web', () => ({
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

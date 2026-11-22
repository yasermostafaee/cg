import { afterEach, describe, expect, it } from 'vitest';
import type { FrameTransitionPhase } from '@cg/shared-schema';
import { animateFocusArtwork } from '../src/focus-artwork.js';

afterEach(() => {
  document.body.innerHTML = '';
});

function fixture() {
  const container = document.createElement('div');
  const roots = ['outgoing', 'incoming'].map((id) => {
    const root = document.createElement('div');
    root.id = id;
    Object.defineProperties(root, { offsetWidth: { value: 1920 }, offsetHeight: { value: 1080 } });
    root.innerHTML =
      '<div class="cg-comp-inner"><span>Caption one</span><span style="display:none">Hidden Focus title</span><div data-import="one">Graphic one</div><div data-import="two">Graphic two</div></div>';
    container.appendChild(root);
    return root;
  });
  document.body.appendChild(container);
  const outgoing = roots[0]!;
  const incoming = roots[1]!;
  outgoing.style.zIndex = '2';
  incoming.style.display = 'none';
  incoming.style.zIndex = '1';
  const base = { x: 0, y: 0, width: 1920, height: 1080 };
  const cell = { x: 960, y: 540, width: 960, height: 540 };
  const phase: FrameTransitionPhase = {
    authoredPreset: true,
    destinationLookId: 'incoming',
    durationMs: 200,
    easing: 'linear',
    frames: [],
    focusArtwork: {
      incomingAbove: true,
      outgoing: { base, from: base, to: cell, fromOpacity: 1, toOpacity: 0 },
      incoming: {
        base,
        from: cell,
        to: base,
        fromOpacity: 0,
        toOpacity: 1,
        cover: { from: cell, to: base, fromOpacity: 0, toOpacity: 1 },
      },
    },
  };
  return { outgoing, incoming, phase, container };
}

describe('complete Focus artwork', () => {
  it('moves all captions and imports with native phase opacity while preserving hidden titles', () => {
    const { outgoing, incoming, phase, container } = fixture();
    const oldStage = outgoing.firstElementChild as HTMLElement;
    const newStage = incoming.firstElementChild as HTMLElement;
    oldStage.style.transform = 'translateX(5px)';
    let callback: ((time: number) => void) | undefined;
    const restore = animateFocusArtwork(outgoing, incoming, phase, {
      now: () => 0,
      raf: (next) => {
        callback = next;
        return 1;
      },
      cancel: () => {
        callback = undefined;
      },
    });
    expect(oldStage.style.transform).toBe('matrix(1,0,0,1,0,0) translateX(5px)');
    expect(newStage.style.opacity).toBe('0');
    expect(incoming.style.display).toBe('');
    callback?.(100);
    expect(oldStage.style.transform).toBe('matrix(0.75,0,0,0.75,480,270) translateX(5px)');
    expect(newStage.style.transform).toBe('matrix(0.75,0,0,0.75,480,270)');
    expect(oldStage.style.opacity).toBe('0.5');
    expect(newStage.style.opacity).toBe('0.5');
    expect(newStage.querySelectorAll('[data-import]')).toHaveLength(2);
    expect((newStage.children[1] as HTMLElement).style.display).toBe('none');
    const aperture = container.querySelector('mask g rect');
    expect(aperture?.getAttribute('fill-opacity')).toBe('0.5');
    expect(aperture?.getAttribute('x')).toBe('480');
    expect(Number(incoming.style.zIndex)).toBeGreaterThan(Number(outgoing.style.zIndex));
    restore?.();
    expect(oldStage.style.transform).toBe('translateX(5px)');
    expect(newStage.style.opacity).toBe('');
    expect(incoming.style.display).toBe('none');
    expect(outgoing.style.zIndex).toBe('2');
    expect(incoming.style.zIndex).toBe('1');
    expect(outgoing.style.getPropertyValue('mask-image')).toBe('');
    expect(container.querySelector('svg')).toBeNull();
    expect(callback).toBeUndefined();
  });

  it('keeps a Dissolve stationary and quantizes both roots and their cover to the mixer clock', () => {
    const { outgoing, incoming, phase, container } = fixture();
    const artwork = phase.focusArtwork!;
    artwork.outgoing.to = artwork.outgoing.base;
    artwork.incoming.from = artwork.incoming.base;
    artwork.incoming.cover!.from = artwork.incoming.base;
    phase.mixerFrameMs = 40;
    let callback: ((time: number) => void) | undefined;
    const restore = animateFocusArtwork(outgoing, incoming, phase, {
      now: () => 0,
      raf: (next) => {
        callback = next;
        return 1;
      },
    });
    callback?.(99);
    expect((outgoing.firstElementChild as HTMLElement).style.transform).toBe('matrix(1,0,0,1,0,0)');
    expect((incoming.firstElementChild as HTMLElement).style.opacity).toBe('0.4');
    expect(container.querySelector('mask g rect')?.getAttribute('fill-opacity')).toBe('0.4');
    callback?.(200);
    expect((incoming.firstElementChild as HTMLElement).style.opacity).toBe('1');
    restore?.();
  });
});

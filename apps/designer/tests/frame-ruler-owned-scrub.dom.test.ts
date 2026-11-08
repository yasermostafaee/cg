/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { FrameRuler } from '../src/renderer/features/timeline/FrameRuler.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function pointer(
  target: Element,
  type: string,
  values: { pointerId: number; buttons: number; button?: number; clientX: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(values)) {
    Object.defineProperty(event, key, { configurable: true, value });
  }
  act(() => target.dispatchEvent(event));
}

describe('B-367 — the timeline ruler owns only scrubs that start on the ruler', () => {
  it('ignores a held drag entering from elsewhere, while its own captured drag still scrubs', () => {
    const onScrub = vi.fn();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root?.render(
        createElement(FrameRuler, {
          frameIn: 0,
          frameOut: 100,
          labelStride: 10,
          gridStride: 5,
          onScrub,
        }),
      );
    });

    const ruler = host.querySelector<HTMLElement>('[aria-label="Frame ruler"]');
    expect(ruler).not.toBeNull();
    Object.defineProperty(ruler!, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, width: 100, right: 100, top: 0, bottom: 20, height: 20 }),
    });
    Object.defineProperty(ruler!, 'setPointerCapture', {
      configurable: true,
      value: vi.fn(),
    });

    // The press began over another surface: crossing the ruler with the button held is inert.
    pointer(ruler!, 'pointermove', { pointerId: 7, buttons: 1, clientX: 25 });
    expect(onScrub).not.toHaveBeenCalled();

    // A primary press that starts on the ruler owns the gesture and continues to scrub.
    pointer(ruler!, 'pointerdown', { pointerId: 9, button: 0, buttons: 1, clientX: 30 });
    pointer(ruler!, 'pointermove', { pointerId: 9, buttons: 1, clientX: 45 });
    expect(onScrub).toHaveBeenCalledTimes(2);

    pointer(ruler!, 'pointerup', { pointerId: 9, button: 0, buttons: 0, clientX: 45 });
    pointer(ruler!, 'pointermove', { pointerId: 9, buttons: 1, clientX: 60 });
    expect(onScrub).toHaveBeenCalledTimes(2);
  });
});

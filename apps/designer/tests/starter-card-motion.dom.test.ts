// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StarterEntry } from '@cg/shared-ipc';
import { StarterCard } from '../src/renderer/features/shell/LandingView.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const starter: StarterEntry = {
  id: 'motion-test',
  label: 'Motion test',
  description: 'A short gallery preview.',
  templateType: 'fullscreen',
  previewUrl: '/starters/motion-test.png',
  motionPreviewUrl: '/starters/motion/motion-test.webm',
};

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function setReducedMotion(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({ matches })),
  });
}

function renderCard(): { button: HTMLButtonElement; video: HTMLVideoElement } {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(createElement(StarterCard, { starter, onOpen: () => undefined })));
  const button = container.querySelector<HTMLButtonElement>('[data-testid="starter-card"]');
  const video = container.querySelector<HTMLVideoElement>('[data-testid="starter-motion-preview"]');
  if (button === null || video === null) throw new Error('motion preview card did not render');
  return { button, video };
}

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
});

describe('starter card motion preview', () => {
  it('lazy-plays on keyboard focus and resets to the poster on blur', () => {
    setReducedMotion(false);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    const { button, video } = renderCard();

    expect(video.preload).toBe('none');
    expect(video.muted).toBe(true);
    expect(video.loop).toBe(true);

    act(() => button.focus());
    expect(play).toHaveBeenCalledOnce();
    act(() => video.dispatchEvent(new Event('playing', { bubbles: true })));
    const activeClass = video.className;

    video.currentTime = 1.25;
    act(() => button.blur());
    expect(pause).toHaveBeenCalledOnce();
    expect(video.currentTime).toBe(0);
    expect(video.className).not.toBe(activeClass);
  });

  it('keeps the static poster when reduced motion is requested', () => {
    setReducedMotion(true);
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    const { button } = renderCard();

    act(() => button.focus());
    expect(play).not.toHaveBeenCalled();
  });
});

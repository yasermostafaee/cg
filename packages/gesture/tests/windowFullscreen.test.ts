// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { windowFullscreenDoor } from '../src/windowFullscreen.js';

describe('windowFullscreenDoor', () => {
  it('toggles and reads back the originating desktop window', async () => {
    let fullscreen = false;
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command === 'plugin:window|is_fullscreen') return fullscreen;
      if (command !== 'plugin:window|set_fullscreen') throw new Error(command);
      fullscreen = args?.['value'] === true;
    });
    const door = windowFullscreenDoor(invoke, document);
    expect(door.available).toBe(true);
    await expect(door.toggle()).resolves.toBe(true);
    await expect(door.toggle()).resolves.toBe(false);
    expect(invoke.mock.calls).toEqual([
      ['plugin:window|is_fullscreen'],
      ['plugin:window|set_fullscreen', { value: true }],
      ['plugin:window|is_fullscreen'],
      ['plugin:window|is_fullscreen'],
      ['plugin:window|set_fullscreen', { value: false }],
      ['plugin:window|is_fullscreen'],
    ]);
  });

  it('calls the browser API during the user action and observes browser exits', async () => {
    const owner = document.implementation.createHTMLDocument();
    const root = owner.documentElement;
    let fullscreenElement: Element | null = null;
    const requestFullscreen = vi.fn(async () => {
      fullscreenElement = root;
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenElement = null;
    });
    Object.defineProperties(owner, {
      fullscreenEnabled: { value: true },
      fullscreenElement: { get: () => fullscreenElement },
      exitFullscreen: { value: exitFullscreen },
    });
    Object.defineProperty(root, 'requestFullscreen', { value: requestFullscreen });
    const door = windowFullscreenDoor(null, owner);
    const onChange = vi.fn();
    const unsubscribe = door.subscribe(onChange);
    expect(door.available).toBe(true);
    const entered = door.toggle();
    expect(requestFullscreen).toHaveBeenCalledOnce();
    await expect(entered).resolves.toBe(true);
    const exited = door.toggle();
    expect(exitFullscreen).toHaveBeenCalledOnce();
    await expect(exited).resolves.toBe(false);
    owner.dispatchEvent(new Event('fullscreenchange'));
    expect(onChange).toHaveBeenCalledOnce();
    unsubscribe();
    owner.dispatchEvent(new Event('fullscreenchange'));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('reports fullscreen unavailable when the browser does not allow it', () => {
    const owner = document.implementation.createHTMLDocument();
    const door = windowFullscreenDoor(null, owner);
    expect(door.available).toBe(false);
  });
});

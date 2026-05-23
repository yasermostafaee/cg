import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRuntime } from '../src/runtime.js';
import { lowerThirdScene } from './fixtures.js';

describe('createRuntime — lifecycle', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.body.className = '';
  });

  it('renders the stage and hides it via cg-pending initially', () => {
    createRuntime(lowerThirdScene, { skipFontLoad: true });
    expect(document.body.classList.contains('cg-pending')).toBe(true);
    expect(document.querySelector('.cg-stage')).toBeTruthy();
  });

  it('reveals the stage after play()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.ready;
    await runtime.play({ anchor: 'دکتر نادری' });
    expect(document.body.classList.contains('cg-pending')).toBe(false);
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('دکتر نادری');
  });

  it('update() merges into existing values', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({ anchor: 'first' });
    await runtime.update({ anchor: 'second' });
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('second');
  });

  it('update() with replace mode clears omitted keys to defaults', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({ anchor: 'first' });
    await runtime.update({}, { mode: 'replace' });
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    // anchor falls back to its declared default 'سارا نادری'
    expect(nameEl?.textContent).toBe('سارا نادری');
  });

  it('stop() re-adds cg-pending', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({});
    await runtime.stop();
    expect(document.body.classList.contains('cg-pending')).toBe(true);
  });

  it('play() after stop() works (replay)', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({ anchor: 'first' });
    await runtime.stop();
    await runtime.play({ anchor: 'second' });
    const nameEl = document.querySelector<HTMLElement>('[data-cg-element-id="name"]');
    expect(nameEl?.textContent).toBe('second');
  });

  it('remove() detaches the stage and throws on subsequent play()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    await runtime.play({});
    runtime.remove();
    expect(document.querySelector('.cg-stage')).toBeNull();
    await expect(runtime.play({})).rejects.toThrow(/Runtime removed/);
  });

  it('emits ready / play.start / play.end / stop.start / stop.end', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const seen: string[] = [];
    runtime.on('ready', () => seen.push('ready'));
    runtime.on('play.start', () => seen.push('play.start'));
    runtime.on('play.end', () => seen.push('play.end'));
    runtime.on('stop.start', () => seen.push('stop.start'));
    runtime.on('stop.end', () => seen.push('stop.end'));
    await runtime.ready;
    await runtime.play({});
    await runtime.stop();
    expect(seen).toEqual(['ready', 'play.start', 'play.end', 'stop.start', 'stop.end']);
  });

  it('emits update events on update()', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const cb = vi.fn();
    runtime.on('update', cb);
    await runtime.play({});
    await runtime.update({ anchor: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscriber cleanup unsubscribes', async () => {
    const runtime = createRuntime(lowerThirdScene, { skipFontLoad: true });
    const cb = vi.fn();
    const off = runtime.on('play.start', cb);
    off();
    await runtime.play({});
    expect(cb).not.toHaveBeenCalled();
  });
});

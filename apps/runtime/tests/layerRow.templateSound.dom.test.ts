// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { VERB_COUNT } from '../src/renderer/features/layers/layerTable.js';
import { itemWith, renderLayerRow, templateWith, type RenderedRow } from './support/layerRow.js';

/**
 * `D-165` — **A ROW WHOSE TEMPLATE MAKES SOUND SAYS SO.** `TemplateInfo.hasSound` (derived once at
 * import by `hasSoundEffects`) puts a speaker mark in the alias cell — a FACT (`Tag`), never a
 * control, and no new column: the verb block stays `VERB_COUNT` wide. A template without sound,
 * or imported before the field existed, shows nothing.
 */

let rendered: RenderedRow | null = null;
afterEach(async () => {
  await rendered?.unmount();
  rendered = null;
  vi.restoreAllMocks();
});

const mark = (): HTMLElement | null =>
  rendered?.container.querySelector<HTMLElement>('[data-template-sound]') ?? null;
const toggleOf = (): HTMLButtonElement | null =>
  rendered?.container.querySelector<HTMLButtonElement>('[data-template-sound-toggle]') ?? null;

describe('D-165 — the template-sound mark on a row', () => {
  it('🔴 a template with sound marks its row — a fact, not a control', async () => {
    rendered = await renderLayerRow({
      item: itemWith('loaded'),
      template: templateWith({ hasSound: true }),
    });
    const m = mark();
    expect(m).not.toBeNull();
    expect(m!.tagName).not.toBe('BUTTON');
    expect(m!.closest('button')).toBeNull();
    expect(m!.getAttribute('tabindex')).toBeNull();
    expect(m!.getAttribute('title')).toBe('Template sound');
    expect(m!.querySelector('svg')).not.toBeNull();
  });

  it('no sound, or a template imported before the field, shows nothing (the control)', async () => {
    rendered = await renderLayerRow({ item: itemWith('loaded'), template: templateWith() });
    expect(mark()).toBeNull();
    await rendered.unmount();
    rendered = await renderLayerRow({
      item: itemWith('loaded'),
      template: templateWith({ hasSound: false }),
    });
    expect(mark()).toBeNull();
  });

  it('🔴 Q9 — a row with template sound offers Mute beside the mark; the press asks the bridge, nothing else', async () => {
    rendered = await renderLayerRow({
      item: itemWith('on-air'),
      template: templateWith({ hasSound: true }),
    });
    const set = vi.fn(() => Promise.resolve({ ok: true }));
    (window.cg.stack as unknown as { setSoundMuted: unknown }).setSoundMuted = set;
    const toggle = toggleOf();
    expect(toggle?.tagName).toBe('BUTTON');
    expect(toggle?.getAttribute('data-template-sound-toggle')).toBe('mute');
    expect(toggle?.getAttribute('aria-pressed')).toBe('false');
    await act(async () => {
      toggle?.click();
      await Promise.resolve();
    });
    expect(set).toHaveBeenCalledWith({ itemId: 'item-1', muted: true });
    expect(rendered.stubs.take).not.toHaveBeenCalled();
    expect(rendered.stubs.update).not.toHaveBeenCalled();
  });

  it('Q9 — a muted row says so on the mark, and its toggle offers Unmute', async () => {
    rendered = await renderLayerRow({
      item: itemWith('loaded', { soundMuted: true }),
      template: templateWith({ hasSound: true }),
    });
    expect(mark()?.getAttribute('title')).toBe('Template sound muted');
    expect(mark()?.getAttribute('data-template-sound')).toBe('muted');
    expect(toggleOf()?.getAttribute('data-template-sound-toggle')).toBe('unmute');
    expect(toggleOf()?.getAttribute('aria-pressed')).toBe('true');
  });

  it('Q9 — no template sound, no toggle', async () => {
    rendered = await renderLayerRow({ item: itemWith('loaded'), template: templateWith() });
    expect(toggleOf()).toBeNull();
  });

  it('adds no verb: the row keeps its declared verb count', async () => {
    rendered = await renderLayerRow({
      item: itemWith('loaded'),
      template: templateWith({ hasSound: true }),
    });
    const block = rendered.container.querySelector('[data-verb-block]');
    expect(block).not.toBeNull();
    expect(block!.children.length).toBe(VERB_COUNT);
    expect(block!.contains(mark())).toBe(false);
    expect(rendered.buttons().has('Template sound')).toBe(false);
  });
});

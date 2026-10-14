// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
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

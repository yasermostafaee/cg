// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { LayerTableHeader } from '../src/renderer/features/layers/LayerTableHeader.js';
import type { Density } from '../src/renderer/features/layers/layerTable.js';

/**
 * §5 — THE TOGGLE COLUMN'S HEAD NAMES THE COLUMN, NOT A VERB.
 *
 * The head is one word above thirty buttons and cannot be per-row, so any verb it
 * names is wrong on the rows showing the other half of the toggle: it read `LOAD`,
 * and every bound row rendered a TRASH glyph beneath it — the precise misreading
 * the sticky header exists to prevent, printed by the header itself. This
 * product's STOP and CLEAR are the inverse of the reference product's, which is
 * why a wrong word above a glyph is an air risk and not a tidiness question.
 *
 * The fix may not be the OTHER verb — that is the same defect mirrored — so this
 * pins both halves: the head is neutral, AND it is not either verb.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

async function renderHeader(density: Density = 'full'): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(LayerTableHeader, { density })));
  });
  return container;
}

const heads = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('[data-verb-head]')].map((h) => h.textContent ?? '');

describe('LayerTableHeader — the toggle column head', () => {
  it('names the COLUMN and neither verb', async () => {
    const el = await renderHeader();
    expect(heads(el)[0]).toBe('ITEM');
    // Not LOAD (wrong above a bound row's trash glyph) and not REMOVE (wrong
    // above an empty row's download glyph).
    expect(heads(el)[0]).not.toBe('LOAD');
    expect(heads(el)[0]).not.toBe('REMOVE');
  });

  it('still states the toggle in words, so nothing is lost by the neutral head', async () => {
    const el = await renderHeader();
    const title = el.querySelector('[data-verb-head]')?.getAttribute('title') ?? '';
    expect(title).toContain('LOAD');
    expect(title).toContain('REMOVE');
  });

  it('leaves every other head naming its verb — only the toggle column changed', async () => {
    const el = await renderHeader();
    expect(heads(el).slice(1)).toEqual(['PLAY', 'ON PVW', 'NEXT', 'STOP', 'CLEAR']);
  });
});

/**
 * 🔴 `CONSOLE-LOOK-06` DELTA D5 — THE STATE TALLY IS NOT IN THIS HEAD ANY MORE, AND THAT IS
 * WHAT THIS FILE NOW PINS. The reference's header is `# / State / Name / Template / …` and its
 * counts live in the sub-bar, measured; ours had put an `N on air` chip there as well, so the
 * same number was being stated twice.
 *
 * ⚠ THE CONTRACT DID NOT GO WITH IT — it MOVED, and it is asserted where it now renders:
 * `B-213`'s two-numbers-two-meanings and `B-224`'s both-counts-whole live in
 * `layers-header-tally.spec.ts`, against the sub-bar, in a real browser. Do not read the
 * negative below as those rules being dropped; read it as the reason to look there.
 */
describe('LayerTableHeader — the State head after the tally left it', () => {
  it('is the WORD and nothing else — no count, in either colour', async () => {
    const el = await renderHeader();
    expect(el.querySelector('[data-air-tally]')).toBeNull();
    expect(el.querySelector('[data-error-tally]')).toBeNull();
    const head = [...el.querySelectorAll<HTMLElement>('[role="row"] > span')].find((x) =>
      (x.textContent ?? '').startsWith('State'),
    );
    expect((head?.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe('State');
  });

  it('still says in words what the column is, which is the half a head owes', async () => {
    const el = await renderHeader();
    const head = [...el.querySelectorAll<HTMLElement>('[role="row"] > span')].find((x) =>
      (x.textContent ?? '').startsWith('State'),
    );
    expect(head?.getAttribute('title')).toMatch(/on air, ready, empty/);
  });

  it('🔴 and the reference’s own header columns are all still here, in order', async () => {
    const el = await renderHeader();
    const cells = [...el.querySelectorAll<HTMLElement>('[role="row"] > span')].map((x) =>
      (x.textContent ?? '').trim(),
    );
    // The `#` column stays: the reference has one too (measured), and it carries the row's
    // position — the layer number golden rule 11 asks to keep reachable.
    expect(cells[0]).toBe('#');
    expect(cells[1]).toBe('State');
    expect(cells[2]).toBe('Name');
  });
});

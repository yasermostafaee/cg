// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { LayerTableHeader } from '../src/renderer/features/layers/LayerTableHeader.js';

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

async function renderHeader(onAirCount = 0, unverifiable = false): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(LayerTableHeader, { density: 'full', onAirCount, unverifiable }),
      ),
    );
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

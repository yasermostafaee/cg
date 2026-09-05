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

async function renderHeader(
  tally: { onAir: number; inError: number } = { onAir: 0, inError: 0 },
  unverifiable = false,
  density: Density = 'full',
): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(LayerTableHeader, { density, tally, unverifiable }),
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

/**
 * `B-213` — THE TALLY SAYS WHAT IT COUNTS, AND KEEPS "ON AIR" AND "IN ERROR" APART.
 *
 * On 2026-09-04 the header read `State (2)` in the air colour over two rows whose
 * takes had just been refused. The number was right for STOP ALL's question and wrong
 * for the one a control room asks of a green number, and nothing on the surface said
 * which question it was answering.
 */
/** The STATE head's VISIBLE text, whitespace collapsed — SVG marks contribute nothing. */
function stateHeadText(el: HTMLElement): string {
  const head =
    el.querySelector<HTMLElement>('[data-air-tally], [data-error-tally]')?.parentElement ??
    [...el.querySelectorAll<HTMLElement>('[role="row"] > span')].find((s) =>
      (s.textContent ?? '').startsWith('State'),
    ) ??
    null;
  return (head?.textContent ?? '').replace(/\s+/g, ' ').trim();
}

describe('LayerTableHeader — the State tally', () => {
  it('THE INCIDENT: two refused rows and nothing on air shows the error count and NO air count', async () => {
    const el = await renderHeader({ onAir: 0, inError: 2 });
    expect(el.querySelector('[data-air-tally]')).toBeNull();
    const error = el.querySelector<HTMLElement>('[data-error-tally]');
    expect(error?.textContent?.trim()).toBe('2');
    expect(error?.getAttribute('aria-label')).toBe('2 items in error');
    // Not the air colour, and no air words anywhere visible.
    expect(el.textContent).not.toContain('on air');
  });

  /*
    `B-224` — THE WORDS LEFT THE HEAD. `(1 on air) (2 in error)` needed 160 px of a 132 px
    cell, so the second count was cut off and the operator could not see how many rows
    were in error. Each state is now ITS NUMBER in ITS COLOUR with the row's own mark
    beside it; the words live in the tooltip and the accessible name, which cost no width.
  */
  it('🔴 B-224 — 1 on air and 2 in error: BOTH numbers are in the DOM, in the compact form, with the rows’ own marks', async () => {
    const el = await renderHeader({ onAir: 1, inError: 2 });
    const air = el.querySelector<HTMLElement>('[data-air-tally]');
    const error = el.querySelector<HTMLElement>('[data-error-tally]');
    // Both numbers, whole.
    expect(air?.textContent?.trim()).toBe('1');
    expect(error?.textContent?.trim()).toBe('2');
    // The compact form: the word, then the two numbers — no parentheses, no words.
    expect(stateHeadText(el)).toBe('State 1 2');
    expect(el.textContent).not.toMatch(/on air|in error|\(|\)/);
    // The rows' own marks beside the numbers: CircleDot for on air, TriangleAlert for error.
    expect(air?.querySelector('svg.lucide-circle-dot')).not.toBeNull();
    expect(error?.querySelector('svg.lucide-triangle-alert')).not.toBeNull();
    // The full words travel where they cost no width: the tooltip and the accessible name.
    expect(air?.getAttribute('title')).toMatch(/^1 on air/);
    expect(error?.getAttribute('title')).toMatch(/^2 in error/);
    expect(air?.getAttribute('aria-label')).toBe('1 items on air');
    expect(error?.getAttribute('aria-label')).toBe('2 items in error');
    // Nothing on the head hides an overflow — a hidden overflow is how the count went missing.
    expect(air?.parentElement?.style.overflow).not.toBe('hidden');
  });

  it('🔴 B-224 — a single state renders as one mark and one number, with no stray separator', async () => {
    const el = await renderHeader({ onAir: 4, inError: 0 });
    const air = el.querySelector<HTMLElement>('[data-air-tally]');
    expect(air?.textContent?.trim()).toBe('4');
    expect(air?.getAttribute('aria-label')).toBe('4 items on air');
    expect(el.querySelector('[data-error-tally]')).toBeNull();
    expect(stateHeadText(el)).toBe('State 4');
    expect(el.textContent).not.toMatch(/[()/·|,]/);
  });

  it('🔴 B-224 — at the icon-only density the marks are dropped and the numbers are kept', async () => {
    const el = await renderHeader({ onAir: 12, inError: 12 }, false, 'tight');
    const air = el.querySelector<HTMLElement>('[data-air-tally]');
    const error = el.querySelector<HTMLElement>('[data-error-tally]');
    expect(air?.textContent?.trim()).toBe('12');
    expect(error?.textContent?.trim()).toBe('12');
    expect(air?.querySelector('svg')).toBeNull();
    expect(error?.querySelector('svg')).toBeNull();
    // …and the head can WRAP the counts under the word rather than clip them.
    expect(air?.parentElement?.style.flexWrap).toBe('wrap');
  });

  it('says NOTHING at rest — no zero in either colour', async () => {
    const el = await renderHeader();
    expect(el.querySelector('[data-air-tally]')).toBeNull();
    expect(el.querySelector('[data-error-tally]')).toBeNull();
    expect(stateHeadText(el)).toBe('State');
  });

  it('keeps the §4 grey when nothing can confirm the air count', async () => {
    const el = await renderHeader({ onAir: 2, inError: 0 }, true);
    const air = el.querySelector<HTMLElement>('[data-air-tally]');
    expect(air?.hasAttribute('data-unverifiable')).toBe(true);
    expect(air?.textContent?.trim()).toBe('2');
    expect(air?.getAttribute('title')).toMatch(/cannot be reached/);
  });
});

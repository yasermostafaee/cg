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

async function renderHeader(
  tally: { onAir: number; inError: number } = { onAir: 0, inError: 0 },
  unverifiable = false,
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
        createElement(LayerTableHeader, { density: 'full', tally, unverifiable }),
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
describe('LayerTableHeader — the State tally', () => {
  it('THE INCIDENT: two refused rows and nothing on air shows "2 in error" and NO air count', async () => {
    const el = await renderHeader({ onAir: 0, inError: 2 });
    expect(el.querySelector('[data-air-tally]')).toBeNull();
    const error = el.querySelector<HTMLElement>('[data-error-tally]');
    expect(error?.textContent).toContain('2 in error');
    expect(error?.getAttribute('aria-label')).toBe('2 items in error');
    // Not the air colour.
    expect(el.textContent).not.toContain('on air');
  });

  it('says "on air" in words — a bare parenthesised number is gone', async () => {
    const el = await renderHeader({ onAir: 3, inError: 0 });
    const air = el.querySelector<HTMLElement>('[data-air-tally]');
    expect(air?.textContent).toContain('3 on air');
    expect(air?.getAttribute('aria-label')).toBe('3 items on air');
    expect(el.querySelector('[data-error-tally]')).toBeNull();
    expect(el.textContent).not.toMatch(/\(3\)/);
  });

  it('shows both when both are true — one on air from another console, two refused here', async () => {
    const el = await renderHeader({ onAir: 1, inError: 2 });
    expect(el.querySelector('[data-air-tally]')?.textContent).toContain('1 on air');
    expect(el.querySelector('[data-error-tally]')?.textContent).toContain('2 in error');
  });

  it('says NOTHING at rest — no zero in either colour', async () => {
    const el = await renderHeader();
    expect(el.querySelector('[data-air-tally]')).toBeNull();
    expect(el.querySelector('[data-error-tally]')).toBeNull();
  });

  it('keeps the §4 grey when nothing can confirm the air count', async () => {
    const el = await renderHeader({ onAir: 2, inError: 0 }, true);
    const air = el.querySelector<HTMLElement>('[data-air-tally]');
    expect(air?.hasAttribute('data-unverifiable')).toBe(true);
    expect(air?.textContent).toContain('2 on air');
  });
});

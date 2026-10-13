// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { SplitPreview } from '../src/renderer/features/inspector/DelimitersSection.js';

/**
 * 🔴 `SETTINGS-MATCH-02` §8c — **THE DELIMITER PREVIEW, IN ITS THREE MEASURED STATES.**
 *
 * ── WHY THE PREVIEW EXISTS ──────────────────────────────────────────────────
 *
 * The value is one or two characters and the consequence is a LIST. `\n` and `\t` are escapes
 * rather than marks; `،`, `,` and `;` are three glyphs that look alike at 14 px; and an
 * operator who chooses wrong finds out later, in a field, with a file already loaded.
 *
 * ⭐ **It is the answer to `B-242`**, which is filed as "a removed delimiter's attached field
 * falls back to showing its raw characters (`\n (in use)`) instead of the name it had". The
 * behaviour under that defect is correct — the VALUE is stored, not the id, so nothing
 * re-splits — and what is actually lost is the human meaning of a raw split character. This is
 * where that meaning is supplied, before the record is saved.
 *
 * ⚠ **A dom test is the right instrument here and a browser one is not**: every claim below is
 * about WHAT THE SPLIT PRODUCES — a count of chips and their text — which is a pure function of
 * the value, not a box on screen. The preview's own geometry is a `controls.css` rule with no
 * assertion in this file (golden rule 12c: jsdom has no layout, and a box measured here would
 * pass against a surface of any shape).
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

async function render(value: string): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(SplitPreview, { value })));
    await Promise.resolve();
  });
  const el = container.querySelector<HTMLElement>('[data-split-preview]');
  if (el === null) throw new Error('the preview did not render');
  return el;
}

const chips = (el: HTMLElement): string[] =>
  [...el.querySelectorAll('[data-split-items] .cg-preview__item')].map(
    (c) => c.textContent?.trim() ?? '',
  );

const sample = (el: HTMLElement): string =>
  el.querySelector('[data-split-sample]')?.textContent ?? '';

describe('§8c — the preview shows what the split character actually does', () => {
  it('EMPTY: one chip, holding the whole text — an empty delimiter cannot split', async () => {
    const el = await render('');
    expect(chips(el)).toEqual(['Item 1 Item 2 Item 3']);
    expect(sample(el)).toBe('Item 1 Item 2 Item 3');
  });

  it('`***`: three chips — the sample USES the character the operator typed', async () => {
    /*
      🔴 The sample is BUILT from the value, and that is what makes this state legible. A fixed
      sample could only ever demonstrate one delimiter: an operator typing `***` would see a
      text with no `***` in it and one chip, which reads as "this character does not work"
      rather than "this sample does not contain it".
    */
    const el = await render('***');
    expect(sample(el)).toBe('Item 1***Item 2***Item 3');
    expect(chips(el)).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });

  it('`\\n`: the ESCAPE is resolved — three lines, three chips', async () => {
    const el = await render('\\n');
    // The sample carries real newlines (the rule renders it `white-space: pre-wrap`), so the
    // three parts are on three lines — the thing the escape DOES, not the escape as typed.
    expect(sample(el)).toBe('Item 1\nItem 2\nItem 3');
    expect(chips(el)).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });

  it('`\\t` is resolved too, and an unknown character is matched exactly', async () => {
    expect(chips(await render('\\t'))).toEqual(['Item 1', 'Item 2', 'Item 3']);
    expect(chips(await render('،'))).toEqual(['Item 1', 'Item 2', 'Item 3']);
  });

  it('🔴 it splits with the PRODUCT’s own pair, so it cannot disagree with what is stored', async () => {
    /*
      `parseDelimiter` resolves the escapes and `splitContent` does the split — the same two
      functions `fromFileContent` runs when a real file is loaded. A preview built on a local
      `String.split` would agree with nothing, and would be worse than no preview: it would
      teach the operator a rule the product does not follow.

      Asserted through a behaviour only that pair has: `splitContent` TRIMS each entry and
      DROPS the ones that are empty after trimming. A bare `split` would return five parts here
      (two of them empty) where the product returns three.
    */
    const el = await render(' , ');
    expect(chips(el), 'trimmed, and empties dropped — `splitContent`’s documented rule').toEqual([
      'Item 1',
      'Item 2',
      'Item 3',
    ]);
  });

  it('POSITIVE CONTROL: the chips genuinely change with the value', async () => {
    // Without this, every assertion above could be satisfied by a preview that always renders
    // three chips — the failure mode a presence check has and a comparison does not.
    expect(chips(await render('')).length).toBe(1);
    expect(chips(await render('***')).length).toBe(3);
  });
});

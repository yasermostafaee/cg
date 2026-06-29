import { afterEach, describe, expect, it } from 'vitest';
import { makeSequenceItemNode } from '../src/sequence-driver.js';

/**
 * D-117 — multi-line sequence item text. The render is a CSS change on the shared item-node factory
 * (`white-space: pre-wrap` + cap to the grid cell + `overflow-wrap: break-word`), so an item honors
 * explicit `\n` and auto-wraps inside the FIXED element box; the per-item transition moves the whole
 * block by the fixed box height, so it animates as one unit (asserted visually by the E2E). Here we
 * assert the DOM shape (happy-dom has no layout engine).
 */

afterEach(() => {
  document.body.innerHTML = '';
});

describe('D-117 — multi-line sequence item text', () => {
  it('the item node uses pre-wrap + a grid-cell cap (break-word) and keeps direction/bidi', () => {
    const node = makeSequenceItemNode(document, 'rtl');
    expect(node.style.whiteSpace).toBe('pre-wrap');
    expect(node.style.maxWidth).toBe('100%'); // wrap inside the fixed grid cell
    expect(node.style.overflowWrap).toBe('break-word');
    expect(node.style.direction).toBe('rtl');
    expect(node.style.unicodeBidi).toBe('isolate');
    expect(node.style.gridArea).toBe('1 / 1'); // still anchored in the single cell (box unchanged)
  });

  it('preserves an explicit `\\n` verbatim in the rendered text (RTL multi-line)', () => {
    const node = makeSequenceItemNode(document, 'rtl');
    node.textContent = 'خط اول\nخط دوم';
    expect(node.textContent).toBe('خط اول\nخط دوم');
  });

  it('a single-line item is unchanged (no `\\n` ⇒ same text, same node shape)', () => {
    const node = makeSequenceItemNode(document, 'ltr');
    node.textContent = 'Now: one';
    expect(node.textContent).toBe('Now: one');
    expect(node.style.direction).toBe('ltr');
  });
});

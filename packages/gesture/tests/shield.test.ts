// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { mountShield } from '../src/shield.js';

/**
 * B-140 — the shield on its own.
 *
 * `mountShield` is exported, so it is testable directly — and it has to be: its
 * double-release guard is unreachable through `useDragGesture`, because the hook's
 * one teardown early-returns when there is no active gesture. A guard nothing can
 * reach through the normal path is exactly the kind that rots, so it is pinned
 * here rather than left to the hook's coverage.
 */

afterEach(() => {
  for (const el of document.body.querySelectorAll('[data-cg-drag-shield]')) el.remove();
});

const shields = (): NodeListOf<Element> => document.body.querySelectorAll('[data-cg-drag-shield]');

describe('mountShield', () => {
  it('covers the window, sits above everything, and wears the caller-supplied cursor', () => {
    const s = mountShield(document, 'col-resize');
    const el = s.element;
    expect(el.style.position).toBe('fixed');
    expect(el.style.inset).toBe('0');
    expect(el.style.cursor).toBe('col-resize');
    expect(Number(el.style.zIndex)).toBeGreaterThan(1_000_000);
    expect(shields()).toHaveLength(1);
    s.release();
    expect(shields()).toHaveLength(0);
  });

  it('is hidden from assistive tech — it is a pointer trap, not content', () => {
    const s = mountShield(document, 'row-resize');
    expect(s.element.getAttribute('aria-hidden')).toBe('true');
    s.release();
  });

  it('releases IDEMPOTENTLY, so two terminators cannot make the second one throw', () => {
    const s = mountShield(document, 'col-resize');
    s.release();
    s.release();
    s.release();
    expect(shields()).toHaveLength(0);
  });

  it('holds its own user-select rather than writing document.body — the leak B-140 removes', () => {
    const s = mountShield(document, 'col-resize');
    expect(s.element.style.userSelect).toBe('none');
    expect(document.body.style.userSelect, 'the document must be untouched').toBe('');
    s.release();
    expect(document.body.style.userSelect).toBe('');
  });
});

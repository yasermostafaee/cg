import { afterEach, describe, expect, it } from 'vitest';
import type { Element as SceneElement, Scene, TextElement } from '@cg/shared-schema';
import { TEXT_FIT_MIN_SCALE } from '@cg/shared-schema';
import { fitScaleOf, fitText, isFitText, markTextFit } from '../src/text-fit.js';
import { buildScene } from '../src/scene-builder.js';
import { applyFieldValues } from '../src/bindings.js';

/**
 * 🔴 `TEXT-FIT-01` (`B-147`) — the shrink-to-fit SEARCH and its overflow, on a node whose layout this
 * test states (happy-dom has none): the content's width is `chars × size × 0.55`, its height one line
 * (`size × 1.2`) when it does not wrap. That proves the algorithm — the search, the floor, the
 * overflow and the re-fit on a new value — and NOTHING about geometry: whether a shaped Persian run
 * fits a real box is measured in Chromium (`apps/designer/tests/e2e/text-fit.spec.ts`) and on
 * CasparCG (the report), never here (golden rule 12c).
 */

const BOX = { w: 400, h: 70 };

function laidOut(node: HTMLElement, box = BOX): void {
  const size = (): number => Number.parseFloat(node.style.fontSize) || 0;
  const chars = (): number => [...(node.textContent ?? '')].length;
  Object.defineProperty(node, 'clientWidth', { configurable: true, get: () => box.w });
  Object.defineProperty(node, 'clientHeight', { configurable: true, get: () => box.h });
  Object.defineProperty(node, 'scrollWidth', {
    configurable: true,
    get: () => Math.max(box.w, Math.ceil(chars() * size() * 0.55)),
  });
  Object.defineProperty(node, 'scrollHeight', {
    configurable: true,
    get: () => Math.max(box.h, Math.ceil(size() * 1.2)),
  });
}

function textElement(over: Partial<TextElement> = {}): TextElement {
  return {
    id: 't1',
    name: 'name',
    type: 'text',
    text: 'سارا نادری',
    transform: {
      position: { x: 0, y: 0 },
      size: { w: BOX.w, h: BOX.h },
      scale: { x: 1, y: 1 },
      rotation: 0,
      anchor: { x: 0, y: 0 },
    },
    opacity: 1,
    visible: true,
    locked: false,
    zIndex: 0,
    font: {
      family: 'Vazirmatn',
      weight: 700,
      style: 'normal',
      size: 50,
      lineHeight: 1.2,
      letterSpacing: 0,
    },
    color: '#ffffff',
    align: 'start',
    direction: 'rtl',
    fitMode: 'shrink-to-fit',
    overflow: 'clip',
    wrap: false,
    ...over,
  } as TextElement;
}

function fitNode(text: string, over: Partial<TextElement> = {}): HTMLElement {
  const node = document.createElement('div');
  node.style.whiteSpace = over.wrap === true ? '' : 'nowrap';
  node.textContent = text;
  document.body.appendChild(node);
  laidOut(node);
  markTextFit(node, textElement(over));
  return node;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TEXT-FIT-01 — the shrink-to-fit search', () => {
  it('a text that fits keeps its authored size (scale 1)', () => {
    const node = fitNode('سارا نادری'); // 10 chars × 50 × 0.55 = 275 ≤ 400
    fitText(node);
    expect(node.style.fontSize).toBe('50px');
    expect(fitScaleOf(node)).toBe(1);
    expect(node.style.overflow).toBe('');
  });

  it('🔴 a text that overflows shrinks to the LARGEST size that fits — never below the floor', () => {
    const node = fitNode('محمدعلی رضایی‌نژاد خراسانی'); // 26 chars: 715 px at 50 → needs ~0.56
    fitText(node);
    const scale = fitScaleOf(node);
    expect(scale).toBeGreaterThanOrEqual(TEXT_FIT_MIN_SCALE);
    expect(scale).toBeLessThan(1);
    expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1); // fits…
    // …and is the largest that does: 1 % larger would not.
    const size = Number.parseFloat(node.style.fontSize);
    expect(Math.ceil(26 * size * 1.01 * 0.55)).toBeGreaterThan(400);
    expect(node.style.overflow).toBe('');
  });

  it('too long even at half size: stays at the floor, and clips', () => {
    const node = fitNode('ا'.repeat(40)); // 40 × 25 × 0.55 = 550 > 400 at the floor
    fitText(node);
    expect(fitScaleOf(node)).toBe(TEXT_FIT_MIN_SCALE);
    expect(node.style.fontSize).toBe('25px');
    expect(node.style.overflow).toBe('hidden');
    expect(node.style.textOverflow).toBe('');
  });

  it('…or ends in an ellipsis when the author chose it, on a one-line block box', () => {
    const node = fitNode('ا'.repeat(40), { overflow: 'ellipsis' });
    fitText(node);
    expect(node.style.overflow).toBe('hidden');
    expect(node.style.textOverflow).toBe('ellipsis');
  });

  it('a shorter value re-fits back up to the authored size, and the overflow is released', () => {
    const node = fitNode('ا'.repeat(40));
    fitText(node);
    expect(node.style.overflow).toBe('hidden');
    node.textContent = 'کوتاه';
    fitText(node);
    expect(node.style.fontSize).toBe('50px');
    expect(node.style.overflow).toBe('');
  });

  it('a node with no box yet (display: none, detached) keeps its authored size until it has one', () => {
    const node = fitNode('ا'.repeat(40));
    laidOut(node, { w: 0, h: 0 });
    fitText(node);
    expect(node.style.fontSize).toBe('50px');
    expect(fitScaleOf(node)).toBe(1);
  });

  it('only shrink-to-fit marks a node; anything else is never touched', () => {
    for (const fitMode of ['fixed', 'autosize'] as const) {
      const node = document.createElement('div');
      node.style.fontSize = '50px';
      markTextFit(node, textElement({ fitMode }));
      expect(isFitText(node)).toBe(false);
      fitText(node);
      expect(node.style.fontSize).toBe('50px');
      expect(node.dataset['cgFit']).toBeUndefined();
    }
  });
});

describe('TEXT-FIT-01 — wired into the build and the bindings', () => {
  function scene(text: TextElement, extra: Partial<Scene> = {}): Scene {
    return {
      schemaVersion: 1,
      id: 's',
      name: 's',
      templateType: 'lower-third',
      resolution: { width: 1920, height: 1080 },
      frameRate: 50,
      safeAreas: { title: 10, action: 5 },
      frameRange: { in: 0, out: 50 },
      editorBackdrop: 'transparent',
      layers: [
        {
          id: 'l',
          name: 'l',
          visible: true,
          locked: false,
          blendMode: 'normal',
          children: [text as SceneElement],
        },
      ],
      fields: [{ id: 'guest', label: 'Guest', required: false, type: 'text', default: 'کوتاه' }],
      bindings: [{ fieldId: 'guest', target: { kind: 'text', elementId: 't1' } }],
      fonts: [],
      metadata: { createdAt: '2026-10-15T00:00:00.000Z', updatedAt: '2026-10-15T00:00:00.000Z' },
      ...extra,
    } as unknown as Scene;
  }

  it('🔴 a FIXED text is built exactly as before — no fit stamp, its authored size', () => {
    const built = buildScene(scene(textElement({ fitMode: 'fixed' })), document);
    document.body.appendChild(built.container);
    const node = built.elementMap.get('t1');
    expect(node?.dataset['cgFit']).toBeUndefined();
    expect(node?.style.fontSize).toBe('50px');
    expect(node?.style.overflow).toBe('');
  });

  it('🔴 a field update re-fits in the SAME call — the font is right before anything paints', () => {
    const s = scene(textElement());
    const built = buildScene(s, document);
    document.body.appendChild(built.container);
    const node = built.elementMap.get('t1');
    if (node === undefined) throw new Error('no text node');
    expect(node.dataset['cgFit']).toBe('shrink');
    laidOut(node);

    const apply = (guest: string): void =>
      applyFieldValues(s, { guest }, built.elementMap, built.textOriginals, built.container);
    apply('محمدعلی رضایی‌نژاد خراسانی');
    // No frame, no await: the new, longer name is already at its fitted size.
    expect(fitScaleOf(node)).toBeLessThan(1);
    expect(node.scrollWidth).toBeLessThanOrEqual(node.clientWidth + 1);

    apply('کوتاه');
    expect(node.style.fontSize).toBe('50px');
  });
});

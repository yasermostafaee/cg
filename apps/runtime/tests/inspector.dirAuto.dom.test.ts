// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import {
  __resetDraftsForTest,
  buildApplyPayload,
} from '../src/renderer/features/inspector/draftStore.js';
import { connectionsStub, linkFor } from './support/reachability.js';

/**
 * dev-r028-b4 item 6 — the editor's text direction follows the value, and NOTHING ELSE
 * does.
 *
 * Two claims, and the second is the one worth the test:
 *
 *  1. Free-text editors carry `dir="auto"`, delegating the Unicode first-strong-character
 *     rule to the browser rather than hand-rolling a `text[0]` check — which would get
 *     `@IRIBNEWS` backwards, since `@` is neutral and the first strong character is Latin.
 *  2. The direction is EDITOR-ONLY. It must never reach the staged value, the applied
 *     payload, the scene or air, because a graphic's direction is an AUTHORED property.
 *     If typing Persian silently re-authored it, the operator would be changing the
 *     graphic by editing its text — the B-111 confusion family.
 *
 * jsdom does not IMPLEMENT `dir="auto"` resolution (no bidi engine), so these assert the
 * contract we control — the attribute is delegated, no direction is ever pinned, and the
 * value round-trips byte-identically — and deliberately do not claim to have verified the
 * browser's bidi algorithm.
 */

const TEMPLATE: TemplateInfo = {
  templateId: 'tpl-dir',
  templateType: 'lower-third',
  fields: [
    { id: 'headline', type: 'text', label: 'Headline', default: '' },
    { id: 'brand', type: 'text', label: 'Brand', default: '' },
    { id: 'body', type: 'multiline', label: 'Body', default: '' },
  ],
  groups: [],
} as unknown as TemplateInfo;

let container: HTMLDivElement | null = null;

beforeEach(() => {
  __resetDraftsForTest();
});

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function item(): StackItemState {
  return {
    itemId: 'item-dir',
    templateId: 'tpl-dir',
    fields: { headline: '', brand: '', body: '' },
    status: 'loaded',
    pending: false,
  };
}

async function render(): Promise<HTMLDivElement> {
  const stub = {
    // §0a — BOTH hops, selected by name (support/reachability.ts). `link` is
    // needed too: the health snapshot rides `useBridgeSnapshot`, which reads it.
    link: { status: () => linkFor('both-up'), onStatusChanged: () => () => undefined },
    connections: connectionsStub('both-up'),
    templates: { get: vi.fn(() => Promise.resolve(TEMPLATE)) },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(Inspector, {
          item: item(),
          onApply: () => Promise.resolve({ accepted: true }),
          onDiscard: () => undefined,
        }),
      ),
    );
    await Promise.resolve();
  });
  return container;
}

/** Type into a controlled input/textarea the way React sees a real keystroke. */
async function type(el: HTMLInputElement | HTMLTextAreaElement, text: string): Promise<void> {
  const proto =
    el instanceof window.HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
  });
}

describe('item 6 — free-text editors delegate direction to the browser', () => {
  it('a text input and a multiline textarea both carry dir="auto"', async () => {
    const el = await render();
    const headline = el.querySelector<HTMLInputElement>('input[aria-label="headline"]');
    const body = el.querySelector<HTMLTextAreaElement>('textarea[aria-label="body"]');
    expect(headline?.getAttribute('dir')).toBe('auto');
    expect(body?.getAttribute('dir')).toBe('auto');
  });

  it('NO editor pins a literal direction — that is what would leak into authoring', async () => {
    const el = await render();
    // The whole panel: not one `dir="rtl"` / `dir="ltr"` anywhere. A hard-coded
    // direction on an editor is the first step toward one reaching a value.
    expect(el.querySelectorAll('[dir="rtl"], [dir="ltr"]')).toHaveLength(0);
    for (const node of el.querySelectorAll('[dir]')) {
      expect(node.getAttribute('dir')).toBe('auto');
    }
  });
});

describe('item 6 — the VALUE round-trips unchanged whichever direction was displayed', () => {
  // The four cases a naive `text[0]` check gets wrong or right for the wrong reason.
  const cases: { name: string; value: string }[] = [
    { name: 'Persian (first strong char is RTL → the box flips)', value: 'خبر فوری از تهران' },
    { name: 'Latin (stays LTR)', value: 'BREAKING NEWS' },
    { name: '@-prefixed: neutral first char, LATIN first STRONG char', value: '@IRIBNEWS' },
    { name: 'digit-prefixed, then Persian', value: '۱۴۰۵ خبر' },
  ];

  for (const c of cases) {
    it(`stages and applies ${c.name} byte-identically`, async () => {
      const el = await render();
      const headline = el.querySelector<HTMLInputElement>('input[aria-label="headline"]');
      if (headline === null) throw new Error('headline control missing');
      await type(headline, c.value);

      const payload = buildApplyPayload('item-dir', item().fields);
      // Byte-identical: no direction marker, no embedding control character, no
      // reordering, no normalisation — exactly what the operator typed.
      expect(payload['headline']).toBe(c.value);
      expect(JSON.stringify(payload['headline'])).toBe(JSON.stringify(c.value));
    });
  }

  it('carries no `dir` (or any presentation key) into the applied payload', async () => {
    const el = await render();
    const headline = el.querySelector<HTMLInputElement>('input[aria-label="headline"]');
    const body = el.querySelector<HTMLTextAreaElement>('textarea[aria-label="body"]');
    if (headline === null || body === null) throw new Error('controls missing');
    await type(headline, 'سلام دنیا');
    await type(body, 'خط یک\nخط دوم');

    const payload = buildApplyPayload('item-dir', item().fields);
    // The payload is field VALUES only. The editor's direction is not among them at any
    // depth, and the multiline newline survives untouched.
    expect(JSON.stringify(payload)).not.toContain('"dir"');
    expect(JSON.stringify(payload)).not.toContain('rtl');
    expect(payload['headline']).toBe('سلام دنیا');
    expect(payload['body']).toBe('خط یک\nخط دوم');
  });

  it('a Persian edit followed by a Latin edit leaves only the Latin text — no residue', async () => {
    const el = await render();
    const headline = el.querySelector<HTMLInputElement>('input[aria-label="headline"]');
    if (headline === null) throw new Error('headline control missing');
    // Flipping the box's direction mid-edit must not deposit anything in the value.
    await type(headline, 'خبر فوری');
    await type(headline, 'BREAKING');
    expect(buildApplyPayload('item-dir', item().fields)['headline']).toBe('BREAKING');
  });
});

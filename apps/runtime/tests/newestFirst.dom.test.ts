// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LibraryPanel } from '../src/renderer/features/library/LibraryPanel.js';
import { StackPanel } from '../src/renderer/features/stack/StackPanel.js';

/**
 * A new template or item lands at the TOP of its list.
 *
 * Both registries are insertion-ordered Maps, so the newest thing was arriving at the
 * BOTTOM — a freshly imported template under every bundled starter, a freshly loaded item
 * under everything loaded an hour ago. The operator then had to hunt for the row they had
 * just created, which is precisely the one they are about to act on.
 *
 * RENDER-SIDE ONLY: the bridge's insertion order is the authority on when each item arrived
 * and is not touched. These pin the DISPLAY order against a bridge that still publishes
 * oldest-first.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function template(id: string, name: string): TemplateInfo {
  return { templateId: id, name, templateType: 'lower-third', fields: [] };
}

function item(itemId: string, templateId: string): StackItemState {
  return { itemId, templateId, fields: {}, status: 'idle', pending: false };
}

const OLDEST = template('tpl-oldest', 'Oldest starter');
const NEWEST = template('tpl-newest', 'Just imported');

function stubBridge(templates: TemplateInfo[], stack: StackItemState[]): void {
  const stub = {
    link: { status: () => 'live' as const, onStatusChanged: () => () => undefined },
    templates: {
      list: () => Promise.resolve([...templates]),
      get: (req: { templateId: string }) =>
        Promise.resolve(templates.find((t) => t.templateId === req.templateId) ?? null),
      remove: () => Promise.resolve({ ok: true }),
      import: () => Promise.resolve({ registered: true, templateId: 'x' }),
      onChanged: () => () => undefined,
    },
    stack: {
      snapshot: () => Promise.resolve(stack),
      onStateChanged: () => () => undefined,
      load: () => Promise.resolve({ accepted: true }),
      take: () => Promise.resolve({ accepted: true }),
      update: () => Promise.resolve({ accepted: true }),
      out: () => Promise.resolve({ accepted: true }),
      remove: () => Promise.resolve({ accepted: true }),
      removeAll: () => Promise.resolve({ ok: true, removed: 0 }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function render(node: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, node));
    await Promise.resolve();
  });
  return container;
}

describe('the Library lists the newest template first', () => {
  it('puts the just-imported template above the ones already there', async () => {
    // The registry publishes them oldest-first…
    stubBridge([OLDEST, NEWEST], []);
    const el = await render(createElement(LibraryPanel));

    // …and the operator reads them newest-first.
    const rows = [...el.querySelectorAll('[data-testid^="library-template-"]')];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.getAttribute('data-testid')).toBe(`library-template-${NEWEST.templateId}`);
    expect(rows[1]?.getAttribute('data-testid')).toBe(`library-template-${OLDEST.templateId}`);
  });
});

describe('the Stack lists the newest item first', () => {
  it('puts the just-loaded item at the top, not under everything else', async () => {
    const first = item('item-first', OLDEST.templateId);
    const justLoaded = item('item-just-loaded', NEWEST.templateId);
    stubBridge([OLDEST, NEWEST], [first, justLoaded]);
    const el = await render(createElement(StackPanel, { onSelectionChange: () => undefined }));

    // The row body is the element tooltipped with the templateId; its first span is the label.
    const labels = [...el.querySelectorAll('.cg-row')].map(
      (row) => row.querySelector('div[title] span')?.textContent,
    );
    expect(labels).toEqual(['Just imported', 'Oldest starter']);
  });
});

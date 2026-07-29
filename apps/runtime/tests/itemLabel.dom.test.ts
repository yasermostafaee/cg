// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LibraryPanel } from '../src/renderer/features/library/LibraryPanel.js';
import { StackPanel } from '../src/renderer/features/stack/StackPanel.js';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';

/**
 * R-004, on all three operator-facing panels.
 *
 * The Library learned the manifest name and stopped there. The STACK row and the INSPECTOR
 * header kept printing the raw `templateId` and took their primary line from
 * `fields['title']` — a field most templates do not have — so they fell back to
 * `item-<uuid>`. And for a real imported package the manifest name is the entry
 * COMPOSITION's, which is often a Designer-internal label, so even the Library could show
 * something meaningless.
 *
 * The rule pinned here: the label is the imported FILE NAME, else the manifest name, and
 * NEVER a UUID — on every panel.
 */

// What an operator actually imports: a file they named, and a comp name from the Designer.
const IMPORTED: TemplateInfo = {
  templateId: '310c6b1a-6a1e-4f2a-9c7d-2b8e5a0f4d11',
  name: 'Comp 1',
  sourceFileName: 'news-lower-third.vcg',
  templateType: 'lower-third',
  fields: [],
};

// A bundled starter: no file, but a real label.
const SEEDED: TemplateInfo = {
  templateId: 'de305d54-75b4-431b-adb2-eb6b9e546014',
  name: 'میان‌برنامهٔ خبر — News Composite',
  templateType: 'full-frame',
  fields: [],
};

const ITEM: StackItemState = {
  itemId: 'item-9f2c4d8e-75b4-431b-adb2-eb6b9e546014',
  templateId: IMPORTED.templateId,
  fields: { title: 'نتایج انتخابات' },
  status: 'loaded',
  pending: false,
};

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function stubBridge(templates: TemplateInfo[], stack: StackItemState[] = []): void {
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

const renderLibrary = (): Promise<HTMLDivElement> => render(createElement(LibraryPanel));
const renderStack = (): Promise<HTMLDivElement> =>
  render(createElement(StackPanel, { onSelectionChange: () => undefined }));
const renderInspector = (item: StackItemState): Promise<HTMLDivElement> =>
  render(
    createElement(Inspector, {
      item,
      onApply: () => Promise.resolve({ accepted: true }),
      onDiscard: () => undefined,
    }),
  );

describe('the Library card is labelled by the imported file name', () => {
  it('shows the cleaned file name, not the Designer comp name and not the id', async () => {
    stubBridge([IMPORTED]);
    const el = await renderLibrary();

    expect(el.textContent).toContain('news lower third');
    expect(el.textContent).not.toContain('Comp 1');
    expect(el.textContent).not.toContain(IMPORTED.templateId);
  });

  it('leaves a bundled starter on its manifest name — it has no file', async () => {
    stubBridge([SEEDED]);
    const el = await renderLibrary();

    expect(el.textContent).toContain('میان‌برنامهٔ خبر — News Composite');
    expect(el.textContent).not.toContain(SEEDED.templateId);
  });

  it('keeps the id reachable as a tooltip — a correlation key, not a label', async () => {
    stubBridge([IMPORTED]);
    const el = await renderLibrary();

    const heading = [...el.querySelectorAll('span')].find(
      (s) => s.textContent === 'news lower third',
    );
    expect(heading?.getAttribute('title')).toBe(IMPORTED.templateId);
  });
});

describe('the stack row is labelled by its template', () => {
  it('shows the cleaned file name and never a UUID', async () => {
    stubBridge([IMPORTED], [ITEM]);
    const el = await renderStack();

    expect(el.textContent).toContain('news lower third');
    expect(el.textContent).not.toContain(IMPORTED.templateId);
    expect(el.textContent).not.toContain(ITEM.itemId);
  });

  it('never falls back to item-<uuid> when the template has no title field', async () => {
    const untitled: StackItemState = { ...ITEM, fields: {} };
    stubBridge([IMPORTED], [untitled]);
    const el = await renderStack();

    expect(el.textContent).toContain('news lower third');
    expect(el.textContent).not.toContain(untitled.itemId);
  });

  it('keeps the content title as the secondary line, so two rows of one template differ', async () => {
    const second: StackItemState = { ...ITEM, itemId: 'item-two', fields: { title: 'گزارش زنده' } };
    stubBridge([IMPORTED], [ITEM, second]);
    const el = await renderStack();

    expect(el.textContent).toContain('نتایج انتخابات');
    expect(el.textContent).toContain('گزارش زنده');
  });
});

describe('the Inspector header is labelled by its template', () => {
  it('shows the cleaned file name and never a UUID', async () => {
    stubBridge([IMPORTED], [ITEM]);
    const el = await renderInspector(ITEM);

    const heading = el.querySelector('h3');
    expect(heading?.textContent).toBe('news lower third');
    expect(el.textContent).not.toContain(IMPORTED.templateId);
    expect(el.textContent).not.toContain(ITEM.itemId);
    // Still correlatable, without being read out as a label.
    expect(heading?.getAttribute('title')).toBe(IMPORTED.templateId);
  });
});

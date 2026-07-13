// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { LibraryPanel } from '../src/renderer/features/library/LibraryPanel.js';

/**
 * R-004 — the Library row names the template. The operator scans this panel under time
 * pressure; a UUID is unreadable. The id must stay discoverable (secondary line + tooltip)
 * so a row can still be correlated with a stack item's `templateId` or a served URL, and a
 * template with no usable name must fall back to the id — never an empty row.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function stubBridge(templates: TemplateInfo[]): void {
  const stub = {
    templates: {
      list: () => Promise.resolve(templates),
      import: () => Promise.resolve({ registered: true, templateId: 'x' }),
    },
    stack: { load: () => Promise.resolve({ accepted: true }) },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function renderPanel(templates: TemplateInfo[]): Promise<HTMLDivElement> {
  stubBridge(templates);
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(LibraryPanel)));
    await Promise.resolve();
  });
  return container;
}

const NAMED: TemplateInfo = {
  templateId: '6f1c9b3e-6a1e-4f2a-9c7d-2b8e5a0f4d11',
  name: 'Breaking News — Lower Third',
  templateType: 'lower-third',
  fields: [],
};

const UNNAMED: TemplateInfo = {
  templateId: 'de305d54-75b4-431b-adb2-eb6b9e546014',
  templateType: 'full-frame',
  fields: [],
};

describe('LibraryPanel display name — R-004', () => {
  it('shows the display name as the row heading, not the raw id', async () => {
    const el = await renderPanel([NAMED]);

    expect(el.textContent).toContain('Breaking News — Lower Third');
    // The Load action names the template too — a screen-reader user hears the name.
    expect(el.querySelector(`button[aria-label="Load ${NAMED.name ?? ''}"]`)).not.toBeNull();
    expect(el.querySelector(`button[aria-label="Load ${NAMED.templateId}"]`)).toBeNull();
  });

  it('keeps the id discoverable as secondary text and as a tooltip', async () => {
    const el = await renderPanel([NAMED]);

    // Still correlatable with a stack item's templateId / a served /template/<id> URL.
    expect(el.textContent).toContain(NAMED.templateId);
    const heading = [...el.querySelectorAll('span')].find(
      (s) => s.textContent === 'Breaking News — Lower Third',
    );
    expect(heading?.getAttribute('title')).toBe(NAMED.templateId);
  });

  it('falls back to the id when the template has no name — the row is never blank', async () => {
    const el = await renderPanel([UNNAMED]);

    expect(el.textContent).toContain(UNNAMED.templateId);
    expect(el.querySelector(`button[aria-label="Load ${UNNAMED.templateId}"]`)).not.toBeNull();
    // The id is the PRIMARY line here, so it must not also be repeated on the meta line.
    const occurrences = (el.textContent ?? '').split(UNNAMED.templateId).length - 1;
    expect(occurrences).toBe(1);
  });

  it('renders a mixed library without losing either row', async () => {
    const el = await renderPanel([NAMED, UNNAMED]);

    expect(el.textContent).toContain('Breaking News — Lower Third');
    expect(el.textContent).toContain(UNNAMED.templateId);
    expect(el.querySelectorAll('button[aria-label^="Load "]')).toHaveLength(2);
  });
});

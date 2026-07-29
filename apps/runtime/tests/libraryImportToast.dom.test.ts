// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LibraryPanel } from '../src/renderer/features/library/LibraryPanel.js';
import { onCommandSuccess } from '../src/renderer/features/status/commandFeedback.js';

/**
 * The "Imported X" confirmation is a command TOAST now (via `reportCommandSuccess`), not a
 * message pinned inline in the Library panel where it added to the layout. This drives a real
 * import through the file input (the heavy verify/unpack/export is stubbed) and asserts the
 * success routes to the toast channel and NOTHING is rendered inline in the panel.
 */

vi.mock('../src/renderer/features/library/templateDelivery.js', () => ({
  importTemplateFromBytes: vi.fn(() =>
    Promise.resolve({ templateId: 'tpl-x', displayName: 'News Lower Third', warnings: [] }),
  ),
}));

let container: HTMLDivElement | null = null;
const successMessages: string[] = [];
let unsub: (() => void) | null = null;

beforeEach(() => {
  successMessages.length = 0;
  unsub = onCommandSuccess((m) => successMessages.push(m));
  const stub = {
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
    link: { status: () => 'offline-mock', onStatusChanged: () => () => undefined },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
});

afterEach(() => {
  unsub?.();
  unsub = null;
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

it('a successful import surfaces via the command toast, with nothing inline in the panel', async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(LibraryPanel)));
    await Promise.resolve();
  });

  const input = container.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  const file = {
    name: 'news.vcg',
    arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
  } as unknown as File;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });

  await act(async () => {
    input?.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });

  // Routed to the toast channel…
  expect(successMessages).toContain('Imported “News Lower Third”.');
  // …and NOT pinned inline in the panel.
  expect(container.textContent ?? '').not.toContain('Imported');
});

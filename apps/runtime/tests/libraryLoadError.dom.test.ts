// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { LibraryPanel } from '../src/renderer/features/library/LibraryPanel.js';
import { onCommandError } from '../src/renderer/features/status/commandFeedback.js';

/**
 * B-085 (UX) — a Load refusal (e.g. the bridge is down: Load stays bridge-owned and refused)
 * must surface as the command TOAST, not as inline text pinned inside the narrow library row
 * (where the wrapped message bloated the row). This asserts the Load button routes its error
 * to the `commandFeedback` toast channel and renders NO inline error span in the row.
 */

const TEMPLATE: TemplateInfo = {
  templateId: 'lower-third',
  name: 'Lower Third',
  templateType: 'lower-third',
  fields: [],
};

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

it('a rejected Load surfaces via the command toast and pins nothing inline in the row', async () => {
  const errors: string[] = [];
  const unsubscribe = onCommandError((m) => errors.push(m));

  const stub = {
    templates: {
      list: () => Promise.resolve([TEMPLATE]),
      import: () => Promise.resolve({ registered: true, templateId: 'x' }),
      remove: () => Promise.resolve({ ok: true }),
      onChanged: () => () => undefined,
    },
    link: { status: () => 'offline-mock', onStatusChanged: () => () => undefined },
    stack: {
      load: () =>
        Promise.reject(new Error('Bridge disconnected — command rejected. Not sent to CasparCG.')),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, createElement(LibraryPanel)));
    await Promise.resolve();
  });

  // Click the row's Load button and let the rejection settle.
  await act(async () => {
    container?.querySelector<HTMLButtonElement>('button[aria-label="Load Lower Third"]')?.click();
    await new Promise((r) => setTimeout(r, 0));
  });

  // Routed to the toast channel, message unchanged…
  expect(errors).toContain('Bridge disconnected — command rejected. Not sent to CasparCG.');
  // …and NOT pinned inline in the row (no AsyncButton inline error span).
  expect(container.querySelector('.cg-btn-error')).toBeNull();

  unsubscribe();
});

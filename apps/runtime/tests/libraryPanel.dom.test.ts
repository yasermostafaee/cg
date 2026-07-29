// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import { LibraryPanel } from '../src/renderer/features/library/LibraryPanel.js';
import {
  onCommandError,
  onCommandSuccess,
} from '../src/renderer/features/status/commandFeedback.js';
import { clearPortals, clickDialogButton, openDialog } from './support/dialog.js';

/**
 * R-004 — the Library row names the template. The operator scans this panel under time
 * pressure; a UUID is unreadable. The label is the imported file name, else the manifest
 * name, and NEVER the id — the id stays reachable as the row's tooltip, which is enough to
 * correlate a row with a served `/template/<id>` URL when debugging.
 */

let container: HTMLDivElement | null = null;
// Capture command-feedback (toast) messages — status/errors are toasts now, not inline.
const successMessages: string[] = [];
const errorMessages: string[] = [];
let unsub: (() => void)[] = [];

beforeEach(() => {
  successMessages.length = 0;
  errorMessages.length = 0;
  unsub = [
    onCommandSuccess((m) => successMessages.push(m)),
    onCommandError((m) => errorMessages.push(m)),
  ];
});

afterEach(() => {
  for (const u of unsub) u();
  unsub = [];
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

interface RemoveResult {
  ok: boolean;
  reason?: string;
  message?: string;
}

let removeSpy: Mock;

function stubBridge(templates: TemplateInfo[], removeResult: RemoveResult = { ok: true }): void {
  const live = [...templates];
  removeSpy = vi.fn((req: { templateId: string }) => {
    // Model the bridge: only a confirmed removal actually drops the row.
    if (removeResult.ok) {
      const i = live.findIndex((t) => t.templateId === req.templateId);
      if (i >= 0) live.splice(i, 1);
    }
    return Promise.resolve(removeResult);
  });
  const stub = {
    templates: {
      list: () => Promise.resolve([...live]),
      import: () => Promise.resolve({ registered: true, templateId: 'x' }),
      remove: removeSpy,
      // R-028 (o1) — the panel subscribes to the bridge catalogue push.
      onChanged: () => () => undefined,
    },
    stack: { load: () => Promise.resolve({ accepted: true }) },
    // R-028 — the panel ties its list pull to the link (B-080 rule).
    link: { status: () => 'offline-mock', onStatusChanged: () => () => undefined },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function renderPanel(
  templates: TemplateInfo[],
  removeResult: RemoveResult = { ok: true },
): Promise<HTMLDivElement> {
  stubBridge(templates, removeResult);
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

  it('keeps the id reachable as a tooltip, and OFF the row as text', async () => {
    const el = await renderPanel([NAMED]);

    // A UUID is not information the operator can act on, so it is not printed beside every
    // row. It stays correlatable with a served /template/<id> URL via the tooltip — which
    // is where a correlation key belongs.
    expect(el.textContent).not.toContain(NAMED.templateId);
    const heading = [...el.querySelectorAll('span')].find(
      (s) => s.textContent === 'Breaking News — Lower Third',
    );
    expect(heading?.getAttribute('title')).toBe(NAMED.templateId);
  });

  it('says so in words when a template has no name — never the id, never blank', async () => {
    const el = await renderPanel([UNNAMED]);

    expect(el.textContent).toContain('Unnamed template');
    expect(el.textContent).not.toContain(UNNAMED.templateId);
    expect(el.querySelector('button[aria-label="Load Unnamed template"]')).not.toBeNull();
  });

  it('renders a mixed library without losing either row', async () => {
    const el = await renderPanel([NAMED, UNNAMED]);

    expect(el.textContent).toContain('Breaking News — Lower Third');
    expect(el.textContent).toContain('Unnamed template');
    expect(el.querySelectorAll('button[aria-label^="Load "]')).toHaveLength(2);
  });
});

/**
 * R-005 — the Remove control. Destructive and not undoable (the operator must re-import the
 * `.vcg`), so it is confirm-gated like the StackPanel's Remove-All. The BRIDGE decides
 * whether the removal is allowed; the panel only surfaces its message.
 */
function removeButton(el: HTMLElement, label: string): HTMLButtonElement | null {
  return el.querySelector<HTMLButtonElement>(`button[aria-label="Remove ${label}"]`);
}

describe('LibraryPanel remove — R-005', () => {
  it('confirms in the modal, calls templates.remove, and drops the row', async () => {
    const nativeConfirm = vi.spyOn(window, 'confirm');
    const el = await renderPanel([NAMED]);

    await act(async () => {
      removeButton(el, 'Breaking News — Lower Third')?.click();
      await Promise.resolve();
    });

    // The app's dialog names the template and the consequence; the browser's is never used.
    expect(openDialog()?.textContent).toContain('Breaking News — Lower Third');
    expect(openDialog()?.textContent).toContain('cannot be undone');
    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(removeSpy).not.toHaveBeenCalled();

    await clickDialogButton('Remove');

    expect(removeSpy).toHaveBeenCalledWith({ templateId: NAMED.templateId });
    // The ROW is gone (the panel re-listed).
    expect(removeButton(el, 'Breaking News — Lower Third')).toBeNull();
    expect(el.querySelector('button[aria-label^="Load "]')).toBeNull();
    expect(el.textContent).toContain('No templates yet');
    // The confirmation is a command TOAST now — routed to the feedback channel, not inline.
    expect(successMessages.join('\n')).toContain('Removed “Breaking News — Lower Third”');
  });

  it('does nothing when the operator cancels the modal', async () => {
    const el = await renderPanel([NAMED]);

    await act(async () => {
      removeButton(el, 'Breaking News — Lower Third')?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Cancel');

    expect(removeSpy).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Breaking News — Lower Third');
    expect(openDialog()).toBeNull();
  });

  it('surfaces the bridge refusal verbatim and keeps the row (refuse-while-referenced)', async () => {
    const message = '2 stack item(s) still use this template — remove them (or Remove All) first.';
    const el = await renderPanel([NAMED], { ok: false, reason: 'in-use', message });

    await act(async () => {
      removeButton(el, 'Breaking News — Lower Third')?.click();
      await Promise.resolve();
    });
    await clickDialogButton('Remove');

    // The panel does not pre-judge — it says exactly what the bridge said, via the command
    // TOAST now, never pinned inline in the panel…
    expect(errorMessages).toContain(message);
    expect(el.querySelector('[role="alert"]')).toBeNull();
    // …and the template is still there, still loadable.
    expect(el.textContent).toContain('Breaking News — Lower Third');
    expect(el.querySelector('button[aria-label^="Load "]')).not.toBeNull();
  });
});

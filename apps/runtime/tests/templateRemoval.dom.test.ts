// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SourceAssignments, TemplateInfo } from '@cg/shared-ipc';
import { useTemplatePicker } from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import {
  __resetSourcesForTest,
  currentSourceAssignments,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals } from './support/dialog.js';

/**
 * A9 — REMOVING A TEMPLATE FROM THE LIBRARY.
 *
 * The reported bug: a template that declares live sources could not be removed —
 * pressing Remove did nothing and said nothing, while other entries in the same
 * list removed normally.
 *
 * The first test below is the REGRESSION, and it is written to fail against the
 * code that had the bug: the removal must behave identically whether or not the
 * template declares plates.
 */

const PLAIN: TemplateInfo = {
  templateId: 'tpl-plain',
  name: 'plain',
  templateType: 'lower-third',
  fields: [],
};

const WITH_PLATES: TemplateInfo = {
  templateId: 'tpl-two-box',
  name: 'two-box',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
    sources: [
      {
        elementId: 'el-1',
        sourceId: 'guest-1',
        rect: { x: 0, y: 0, width: 640, height: 360 },
        dynamic: false,
      },
    ],
  },
};

let container: HTMLDivElement | null = null;
let registry: TemplateInfo[] = [];
let assignments: SourceAssignments = { assignments: [] };
let removeResult: { ok: boolean; reason?: string; message?: string } = { ok: true };
const removeCalls: string[] = [];
const setAssignmentCalls: SourceAssignments[] = [];

function installBridge(): void {
  const stub = {
    templates: {
      list: () => Promise.resolve(registry),
      remove: (req: { templateId: string }) => {
        removeCalls.push(req.templateId);
        if (removeResult.ok) registry = registry.filter((t) => t.templateId !== req.templateId);
        return Promise.resolve(removeResult);
      },
    },
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve(assignments),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: (req: SourceAssignments) => {
        setAssignmentCalls.push(req);
        assignments = req;
        return Promise.resolve({ ok: true });
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

/** Mount the picker hook behind a trivial host, and open it. */
async function openPicker(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let open: (() => void) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    open = () => void pickTemplate('Load onto Layer 99');
    return createElement('div', null, pickerDialog);
  }
  await act(async () => {
    root.render(createElement(Host));
    await Promise.resolve();
  });
  await act(async () => {
    open?.();
    await Promise.resolve();
  });
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
  if (dialog === null) throw new Error('picker did not open');
  return dialog;
}

/** Press a button by its accessible name, anywhere in the document. */
async function press(name: RegExp | string): Promise<void> {
  const match = [...document.querySelectorAll<HTMLButtonElement>('button')].filter((b) => {
    const label = b.getAttribute('aria-label') ?? b.textContent ?? '';
    return typeof name === 'string' ? label === name : name.test(label);
  });
  const button = match.at(-1);
  if (button === undefined) throw new Error(`no button matching ${String(name)}`);
  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  registry = [PLAIN, WITH_PLATES];
  assignments = {
    assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }],
  };
  removeResult = { ok: true };
  removeCalls.length = 0;
  setAssignmentCalls.length = 0;
  __resetSourcesForTest();
  installBridge();
  initSources(window.cg);
  await Promise.resolve();
  await Promise.resolve();
});

afterEach(() => {
  container?.remove();
  container = null;
  clearPortals();
  vi.restoreAllMocks();
});

describe('a template that declares live sources removes exactly like one that does not', () => {
  it('🔴 REGRESSION — Remove from the library deletes it, plates or no plates', async () => {
    const dialog = await openPicker();
    expect(dialog.querySelector('[data-template-id="tpl-two-box"]')).not.toBeNull();

    await press(/Delete two-box from this station/);
    await press(/^Delete from station$/);

    expect(removeCalls).toEqual(['tpl-two-box']);
    expect(registry.map((t) => t.templateId)).toEqual(['tpl-plain']);
  });

  it('deletes its ASSIGNMENTS with it — nothing may refer to an entry that is gone', async () => {
    await openPicker();
    await press(/Delete two-box from this station/);
    await press(/^Delete from station$/);

    // "Remove from this station" has to mean something: leaving the bindings
    // behind is state on this machine with nothing left that refers to it.
    expect(setAssignmentCalls.at(-1)).toEqual({ assignments: [] });
    expect(currentSourceAssignments()).toEqual({ assignments: [] });
  });

  it('leaves ANOTHER template assignments alone', async () => {
    assignments = {
      assignments: [
        { templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' },
        { templateId: 'tpl-other', plateId: 'guest-1', sourceId: 'src-bbb' },
      ],
    };
    __resetSourcesForTest();
    initSources(window.cg);
    await Promise.resolve();
    await Promise.resolve();

    await openPicker();
    await press(/Delete two-box from this station/);
    await press(/^Delete from station$/);

    expect(setAssignmentCalls.at(-1)).toEqual({
      assignments: [{ templateId: 'tpl-other', plateId: 'guest-1', sourceId: 'src-bbb' }],
    });
  });
});

describe('a refusal the operator cannot see is its own defect', () => {
  it('says WHY the removal did not happen, in the dialog itself', async () => {
    removeResult = {
      ok: false,
      reason: 'in-use',
      message: '1 stack item(s) still use this template — remove them (or Remove All) first.',
    };
    const dialog = await openPicker();
    await press(/Delete two-box from this station/);
    await press(/^Delete from station$/);

    // In the PICKER's own pinned message region, not a toast behind the modal:
    // this dialog is on top of everything, so a refusal routed anywhere else is
    // a refusal the operator never reads.
    const message = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    expect(message).toMatch(/still use this template/);
    // …and the entry is still listed, because it is still there.
    expect(dialog.querySelector('[data-template-id="tpl-two-box"]')).not.toBeNull();
  });

  it('says so when the call THROWS, rather than swallowing it', async () => {
    const stub = window.cg as unknown as {
      templates: { remove: (req: { templateId: string }) => Promise<unknown> };
    };
    stub.templates.remove = () => Promise.reject(new Error('bridge is down'));

    const dialog = await openPicker();
    await press(/Delete two-box from this station/);
    await press(/^Delete from station$/);

    expect(dialog.querySelector('[data-modal-message]')?.textContent ?? '').toMatch(
      /bridge is down/,
    );
  });

  it('does NOT delete the assignments when the removal was refused', async () => {
    removeResult = { ok: false, reason: 'in-use', message: 'still in use' };
    await openPicker();
    await press(/Delete two-box from this station/);
    await press(/^Delete from station$/);

    // The entry survives, so its bindings must too — dropping them here would
    // silently un-bind a template the operator still has.
    expect(setAssignmentCalls).toEqual([]);
    expect(currentSourceAssignments().assignments).toHaveLength(1);
  });
});

describe('the two verbs no longer share one word', () => {
  it('names the LIBRARY one for what it does, and its confirm names the fallout', async () => {
    const dialog = await openPicker();
    // The row's verb takes a template off THAT ROW; this one deletes it from the
    // station, for every row, undoable only by re-importing the file.
    expect(dialog.textContent).toContain('Delete from station');
    expect(dialog.textContent).not.toContain('Remove');

    await press(/Delete two-box from this station/);
    const confirmText = document.body.textContent ?? '';
    expect(confirmText).toMatch(/every browser|this station/i);
    expect(confirmText).toMatch(/1 plate/);
    expect(confirmText).toMatch(/re-import/i);
  });
});

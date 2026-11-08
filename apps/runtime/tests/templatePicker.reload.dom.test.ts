// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateInfo } from '@cg/shared-ipc';
import {
  useTemplatePicker,
  type TemplateChoice,
} from '../src/renderer/features/fixedLayers/useTemplatePicker.js';
import { reloadTemplateSource } from '../src/renderer/features/library/reloadTemplateSource.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals, openDialog } from './support/dialog.js';

const sourceRecords = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('../src/renderer/features/library/templateSourceStore.js', () => ({
  deleteTemplateSource: vi.fn(() => Promise.resolve()),
  loadTemplateSources: vi.fn(() => Promise.resolve(sourceRecords)),
  pickTemplatePackage: vi.fn(() => Promise.resolve(null)),
  saveTemplateSource: vi.fn(() => Promise.resolve()),
  templateSourcePickerSupported: vi.fn(() => false),
}));

vi.mock('../src/renderer/features/library/reloadTemplateSource.js', () => ({
  reloadTemplateSource: vi.fn((template: TemplateInfo) =>
    Promise.resolve({ template, resetRows: 1 }),
  ),
}));

const ONE: TemplateInfo = {
  templateId: 'tpl-one',
  name: 'One',
  templateType: 'custom',
  fields: [],
};

const TWO: TemplateInfo = {
  templateId: 'tpl-two',
  name: 'Two',
  templateType: 'custom',
  fields: [],
};

const sourceHandle = (name: string): FileSystemFileHandle =>
  ({ kind: 'file', name }) as FileSystemFileHandle;

let container: HTMLDivElement | null = null;
let root: Root | null = null;

function installBridge(): void {
  const templates = [ONE, TWO];
  const stub = {
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    fixedLayers: { config: () => Promise.resolve(null), onConfigChanged: () => () => undefined },
    stack: { remove: () => Promise.resolve({ accepted: true }) },
    templates: {
      list: () => Promise.resolve(templates),
      remove: () => Promise.resolve({ ok: true }),
      onChanged: () => () => undefined,
      onActed: () => () => undefined,
    },
    sources: {
      config: () => Promise.resolve({ sources: [] }),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve({ assignments: [] }),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: () => Promise.resolve({ ok: true }),
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function openPicker(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let open: (() => Promise<TemplateChoice>) | null = null;
  function Host(): JSX.Element {
    const { pickTemplate, pickerDialog } = useTemplatePicker();
    open = () =>
      pickTemplate('Load onto Operator 1', 'high', {
        rowName: 'Operator 1',
        coord: '1-90',
        channel: 1,
        holding: null,
      });
    return createElement('div', null, pickerDialog);
  }
  const mounted = root;
  await act(async () => {
    mounted.render(createElement(Host));
    await Promise.resolve();
  });
  await act(async () => {
    void open?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('picker did not open');
  return dialog;
}

async function openManagement(): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  let open: (() => Promise<void>) | null = null;
  function Host(): JSX.Element {
    const { openTemplateLibrary, pickerDialog } = useTemplatePicker();
    open = () => openTemplateLibrary(1);
    return createElement('div', null, pickerDialog);
  }
  const mounted = root;
  await act(async () => {
    mounted.render(createElement(Host));
    await Promise.resolve();
  });
  await act(async () => {
    await open?.();
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('management dialog did not open');
  return dialog;
}

function buttonByText(dialog: HTMLElement, text: string): HTMLButtonElement {
  const button = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
  if (button === undefined) throw new Error(`button not found: ${text}`);
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(async () => {
  sourceRecords.length = 0;
  sourceRecords.push(
    {
      key: '[1,"tpl-one"]',
      templateId: 'tpl-one',
      channel: 1,
      handle: sourceHandle('one.vcg'),
    },
    {
      key: '[1,"tpl-two"]',
      templateId: 'tpl-two',
      channel: 1,
      handle: sourceHandle('two.vcg'),
    },
  );
  vi.mocked(reloadTemplateSource).mockClear();
  __resetSourcesForTest();
  installBridge();
  initSources(window.cg);
  await Promise.resolve();
  await Promise.resolve();
});

afterEach(async () => {
  if (root !== null) {
    const mounted = root;
    await act(async () => mounted.unmount());
  }
  root = null;
  container?.remove();
  container = null;
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('R-108 — Reload doors in the template picker', () => {
  it('opens directly without a destination or Load commit', async () => {
    const dialog = await openManagement();
    expect(dialog.getAttribute('aria-label')).toBe('Templates · CH 1');
    expect(dialog.textContent).toContain('Import, reload or remove templates on CH 1.');
    expect(dialog.querySelector('[data-template-destination]')).toBeNull();
    expect(dialog.querySelector('[data-template-commit]')).toBeNull();
    expect(buttonByText(dialog, 'Close')).toBeDefined();
    expect(dialog.querySelector('[data-template-reload="tpl-one"]')).not.toBeNull();
    expect(buttonByText(dialog, 'Reload all').disabled).toBe(false);
  });

  it('reloads one while keeping row data, and all while applying file defaults', async () => {
    const dialog = await openPicker();
    const one = dialog.querySelector<HTMLButtonElement>('[data-template-reload="tpl-one"]');
    expect(one?.disabled).toBe(false);
    expect(one?.title).toContain('one.vcg');
    expect(buttonByText(dialog, 'Reload all').disabled).toBe(false);

    await click(one as HTMLButtonElement);
    expect(dialog.querySelector('[data-notice="notice"]')?.textContent).toContain(
      'Reload “One” from the original file?',
    );
    await click(buttonByText(dialog, 'Reload and keep current data'));
    expect(reloadTemplateSource).toHaveBeenCalledTimes(1);
    expect(reloadTemplateSource).toHaveBeenLastCalledWith(
      ONE,
      1,
      expect.objectContaining({ name: 'one.vcg' }),
      'keep',
    );

    await click(buttonByText(dialog, 'Reload all'));
    await click(buttonByText(dialog, 'Reload and use file defaults'));
    expect(reloadTemplateSource).toHaveBeenCalledTimes(3);
    expect(
      vi
        .mocked(reloadTemplateSource)
        .mock.calls.slice(1)
        .map((call) => [call[0].templateId, call[3]]),
    ).toEqual([
      ['tpl-one', 'file-defaults'],
      ['tpl-two', 'file-defaults'],
    ]);
  });
});

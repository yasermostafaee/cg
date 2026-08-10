// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { SourceAssignments, SourceCatalog, TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { SourcesModal } from '../src/renderer/features/sources/SourcesModal.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { connectionsStub, linkFor } from './support/reachability.js';

/**
 * D-137 / C-015 — WHERE a plate is bound, after the 2026-08-10 correction.
 *
 * Defining the installation's sources stays in the Live sources modal; BINDING a
 * plate moved to the INSPECTOR, beside the template being bound. The three
 * properties worth a test are the three the move exists to produce:
 *
 *  1. the modal no longer carries any plate binding at all;
 *  2. the Inspector shows THIS template's plates, and shows nothing for a
 *     template that declares none;
 *  3. 🔴 the assignment is TEMPLATE-LEVEL — an assignment made from one row is
 *     what a DIFFERENT row carrying the same template reads back. That is the
 *     test that pins the semantics rather than trusting the section's label.
 */

const CATALOG: SourceCatalog = {
  sources: [
    { id: 'src-aaa', name: 'Studio A', producer: { kind: 'route', channel: 2 } },
    { id: 'src-bbb', name: 'Baku', producer: { kind: 'route', channel: 3 } },
  ],
};

function plate(elementId: string, sourceId: string) {
  return {
    elementId,
    sourceId,
    rect: { x: 0, y: 0, width: 640, height: 360 },
    dynamic: false,
  };
}

const TWO_BOX: TemplateInfo = {
  templateId: 'tpl-two-box',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
    sources: [plate('el-1', 'guest-1'), plate('el-2', 'guest-2')],
  },
};

const NO_PLATES: TemplateInfo = {
  templateId: 'tpl-plain',
  templateType: 'lower-third',
  fields: [],
  liveSources: {
    resolution: { width: 1920, height: 1080 },
    defaultPosition: { anchor: 'center', dx: 0, dy: 0 },
    sources: [],
  },
};

let container: HTMLDivElement | null = null;
let stored: SourceAssignments = { assignments: [] };
const setCalls: SourceAssignments[] = [];

beforeEach(() => {
  __resetDraftsForTest();
  __resetSourcesForTest();
  stored = { assignments: [] };
  setCalls.length = 0;
});

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function bridgeStub(templates: readonly TemplateInfo[], info: TemplateInfo | null) {
  const stub = {
    link: { status: () => linkFor('both-up'), onStatusChanged: () => () => undefined },
    connections: connectionsStub('both-up'),
    templates: {
      get: vi.fn(() => Promise.resolve(info)),
      list: vi.fn(() => Promise.resolve(templates)),
    },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
    sources: {
      config: () => Promise.resolve(CATALOG),
      onConfigChanged: () => () => undefined,
      setConfig: () => Promise.resolve({ ok: true }),
      assignments: () => Promise.resolve(stored),
      onAssignmentsChanged: () => () => undefined,
      setAssignments: (req: SourceAssignments) => {
        setCalls.push(req);
        stored = req;
        return Promise.resolve({ ok: true });
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return stub;
}

function item(itemId: string, templateId: string): StackItemState {
  return { itemId, templateId, fields: {}, status: 'loaded', pending: false };
}

async function renderInspector(
  stackItem: StackItemState,
  info: TemplateInfo | null,
  templates: readonly TemplateInfo[] = info === null ? [] : [info],
): Promise<HTMLDivElement> {
  bridgeStub(templates, info);
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    initSources(window.cg);
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(Inspector, {
          item: stackItem,
          onApply: () => Promise.resolve({ accepted: true }),
          onDiscard: () => undefined,
        }),
      ),
    );
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

describe('the Live sources modal defines sources and binds nothing', () => {
  it('renders no plate binding at all', async () => {
    bridgeStub([TWO_BOX], TWO_BOX);
    container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      initSources(window.cg);
      root.render(createElement(SourcesModal, { onClose: () => undefined }));
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    // It still DEFINES sources…
    expect(dialog?.textContent).toContain('SOURCES');
    expect(
      [...(dialog?.querySelectorAll<HTMLInputElement>('input[aria-label^="Name of"]') ?? [])].map(
        (i) => i.value,
      ),
    ).toEqual(['Studio A', 'Baku']);
    // …and carries no trace of the binding job it briefly held. Asserted on the
    // section, the plate ids AND the control, because any one of them surviving
    // would put the dialog back to doing two jobs.
    expect(dialog?.textContent).not.toContain('TEMPLATE PLATES');
    expect(dialog?.textContent).not.toContain('guest-1');
    expect(dialog?.querySelector('[data-plate-unassigned]')).toBeNull();
    expect(dialog?.querySelector('select[aria-label^="Source for"]')).toBeNull();
  });
});

describe('the Inspector binds THIS template plates', () => {
  it('renders one row per declared plate, unassigned to start', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const section = el.querySelector('[aria-label="Live plates"]');
    expect(section).not.toBeNull();
    expect(section?.querySelectorAll('select[aria-label^="Source for"]').length).toBe(2);
    // A freshly imported template has ALL of its plates unassigned, which is the
    // ordinary state and is named rather than left blank.
    expect(section?.querySelectorAll('[data-plate-unassigned]').length).toBe(2);
    // The SCOPE is stated in the section, not hidden in a tooltip: this is the
    // template's default, so editing it here changes every row using it.
    expect(section?.textContent).toContain('Set for the template, not this row');
  });

  it('renders NO section for a template that declares no live plates', async () => {
    // An empty heading is a question the operator did not ask, on the panel they
    // use most.
    const el = await renderInspector(item('item-2', 'tpl-plain'), NO_PLATES);
    expect(el.querySelector('[aria-label="Live plates"]')).toBeNull();
  });

  it('offers every defined source by NAME, never by its internal id', async () => {
    const el = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const select = el.querySelector<HTMLSelectElement>('select[aria-label="Source for guest-1"]');
    const labels = [...(select?.options ?? [])].map((o) => o.textContent);
    expect(labels).toEqual(['— not assigned —', 'Studio A', 'Baku']);
    // The id is the VALUE — stable across a rename — while the operator picks
    // the name.
    expect([...(select?.options ?? [])].map((o) => o.value)).toEqual(['', 'src-aaa', 'src-bbb']);
  });

  it('🔴 the assignment is TEMPLATE-LEVEL: a SECOND row carrying it reads the same binding', async () => {
    const first = await renderInspector(item('item-1', 'tpl-two-box'), TWO_BOX);
    const select = first.querySelector<HTMLSelectElement>(
      'select[aria-label="Source for guest-1"]',
    );
    if (select === null) throw new Error('no picker');

    await act(async () => {
      select.value = 'src-aaa';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });
    // It went to the bridge keyed by TEMPLATE, not by item.
    expect(setCalls.at(-1)).toEqual({
      assignments: [{ templateId: 'tpl-two-box', plateId: 'guest-1', sourceId: 'src-aaa' }],
    });

    first.remove();
    // A DIFFERENT stack row, same template. It must read back the binding the
    // other row made — that is what "template-level" means, and the label saying
    // so is not evidence that it is true.
    const second = await renderInspector(item('item-2', 'tpl-two-box'), TWO_BOX);
    const secondSelect = second.querySelector<HTMLSelectElement>(
      'select[aria-label="Source for guest-1"]',
    );
    expect(secondSelect?.value).toBe('src-aaa');
    // …and its OTHER plate is still owed one.
    expect(second.querySelectorAll('[data-plate-unassigned]').length).toBe(1);
  });
});

describe('two templates with the same name are told apart in the heading', () => {
  const TWIN_A: TemplateInfo = { ...TWO_BOX, templateId: 'aaaaaa11-1111', name: 'seghab' };
  const TWIN_B: TemplateInfo = { ...TWO_BOX, templateId: 'bbbbbb22-2222', name: 'seghab' };

  it('adds an id stub ONLY when another template answers to the same name', async () => {
    // R-040's class on a second surface: a display label derived from a
    // non-unique human name, with the unique key present but hidden.
    const el = await renderInspector(item('item-1', 'aaaaaa11-1111'), TWIN_A, [TWIN_A, TWIN_B]);
    const heading = el.querySelector('h3');
    expect(heading?.textContent).toContain('seghab');
    expect(heading?.querySelector('[data-template-stub="aaaaaa"]')).not.toBeNull();
  });

  it('leaves an unambiguous heading alone — a suffix on every one is noise', async () => {
    const el = await renderInspector(item('item-1', 'aaaaaa11-1111'), TWIN_A, [TWIN_A]);
    expect(el.querySelector('h3')?.querySelector('[data-template-stub]')).toBeNull();
  });
});

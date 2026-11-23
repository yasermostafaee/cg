// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  TEMPLATE_TIMING_VERSION,
  type CompositionFieldGroup,
  type ControlLiveLayout,
  type StackItemState,
} from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { setLanguage } from '../src/renderer/i18n/locale.js';
import {
  __resetDraftsForTest,
  buildApplyPayload,
  clearDraft,
  valueAt,
} from '../src/renderer/features/inspector/draftStore.js';
import { connectionsStub, linkFor } from './support/reachability.js';
import { fillBridgeStub } from './support/authStub.js';

/**
 * B-067 — the operator-visible half. A D-119 starter's fields live in a NESTED
 * composition, and the Inspector used to render only the entry comp's flat fields — so
 * the operator saw "No fields." and could not edit the graphic on air.
 *
 * The nested fields now render as a labelled group per composition instance, and editing
 * one stages at its namespaced PATH — the same address the template's binding resolves.
 */

const NESTED_TEMPLATE: TemplateInfo = {
  templateId: 'tpl-title',
  templateType: 'lower-third',
  fields: [], // the ENTRY comp owns no fields — this is the whole bug
  groups: [
    {
      instanceId: 'tt-card',
      name: 'card',
      label: 'کارت عنوان',
      compositionId: 'comp-title-card',
      aggregate: {
        fields: [
          { id: 'name', type: 'text', label: 'Name', required: false, default: 'نام' },
          { id: 'role', type: 'text', label: 'Role', required: false, default: 'سمت' },
        ],
        groups: [],
      },
    },
  ],
};

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
    itemId: 'item-1',
    templateId: 'tpl-title',
    // Seeded the way LibraryPanel seeds it: NESTED under the instance namespace.
    fields: { card: { name: 'نام', role: 'سمت' } },
    status: 'loaded',
    pending: false,
  };
}

async function render(
  info: TemplateInfo,
  selected: StackItemState = item(),
): Promise<HTMLDivElement> {
  const stub = {
    // §0a — BOTH hops, selected by name (support/reachability.ts). `link` is
    // needed too: the health snapshot rides `useBridgeSnapshot`, which reads it.
    link: {
      status: () => linkFor('both-up'),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    templates: {
      get: vi.fn(() => Promise.resolve(info)),
      list: vi.fn(() => Promise.resolve([info])),
      onChanged: () => () => undefined,
    },
    // Phase 6 — the Inspector names the ROW (`useOperatorNames`), so it reads the bank too.
    fixedLayers: {
      config: () => Promise.resolve(null),
      onConfigChanged: () => () => undefined,
      state: () => Promise.resolve([]),
      onStateChanged: () => () => undefined,
    },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(Inspector, {
          item: selected,
          onApply: () => Promise.resolve({ accepted: true }),
          onDiscard: clearDraft,
        }),
      ),
    );
    await Promise.resolve();
  });
  return container;
}

describe('B-067 — the Inspector renders nested-composition fields', () => {
  for (const [locale, words] of [
    ['fa', { ready: 'آماده', primary: 'اصلی', center: 'وسط', fixed: 'ثابت', title: 'عنوان' }],
    ['ar', { ready: 'جاهز', primary: 'الرئيسي', center: 'الوسط', fixed: 'ثابت', title: 'العنوان' }],
  ] as const) {
    it('localizes Inspector chrome and a live plate title in ' + locale, async () => {
      const card = NESTED_TEMPLATE.groups?.[0];
      if (card === undefined) throw Error('Missing field group');
      const titleGroup: CompositionFieldGroup = {
        ...card,
        aggregate: {
          fields: [{ id: 'title', type: 'text', label: 'Title', required: false, default: '' }],
          groups: [],
        },
      };
      const info: TemplateInfo = {
        ...NESTED_TEMPLATE,
        playout: { v: TEMPLATE_TIMING_VERSION, mode: 'static' },
        sharedFrameTitles: [
          [
            ['card', 'title'],
            ['other', 'title'],
          ],
        ],
        groups: [
          titleGroup,
          { ...titleGroup, instanceId: 'other', name: 'other' },
          { ...titleGroup, instanceId: 'authored', name: 'authored', compositionId: 'different' },
        ],
      };
      setLanguage('interface', locale);
      try {
        const el = await render(info, {
          ...item(),
          slot: { channel: 1, layer: 59, server: 'primary' },
        });
        expect(
          el.querySelector('.cg-inspector-identity__summary .cg-meta-chip')?.textContent,
        ).toContain(words.ready);
        expect(el.querySelector('.cg-inspector-identity__details')?.textContent).toContain(
          words.primary,
        );
        expect(el.querySelector('.cg-inspector-position__summary')?.textContent).toContain(
          words.center,
        );
        expect(el.querySelector('[data-testid="timing-mode-fact"]')?.textContent).toBe(words.fixed);
        expect(
          [...el.querySelectorAll('[data-field-heading="title"]')].map(
            (field) => field.textContent,
          ),
        ).toEqual([words.title, words.title, 'Title']);
      } finally {
        await act(async () => setLanguage('interface', 'en'));
      }
    });
  }
  it('keeps every field group visible for a legacy look catalogue without instance ownership', async () => {
    const card = NESTED_TEMPLATE.groups?.[0];
    if (card === undefined) throw new Error('Missing title fixture group');
    const el = await render({
      ...NESTED_TEMPLATE,
      groups: [card, { ...card, instanceId: 'second-card', name: 'other', label: 'Other card' }],
      liveSources: {
        resolution: { width: 1920, height: 1080 },
        defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
        sources: [],
        looks: [
          { id: 'one', name: 'One', entered: { mode: 'cut' }, rects: {} },
          { id: 'two', name: 'Two', entered: { mode: 'cut' }, rects: {} },
        ],
        defaultLookId: 'one',
      },
    });

    await act(async () => el.querySelector<HTMLButtonElement>('[data-look-tab="two"]')?.click());
    expect(el.querySelector('[data-look-tab-active]')?.getAttribute('data-look-tab')).toBe('two');
    expect(el.querySelector('section[aria-label="کارت عنوان fields"]')).not.toBeNull();
    expect(el.querySelector('section[aria-label="Other card fields"]')).not.toBeNull();
  });

  it('shows a labelled group for the nested instance, with its fields (not "No fields.")', async () => {
    const el = await render(NESTED_TEMPLATE);

    expect(el.textContent).not.toContain('No fields.');
    // The group is labelled by the instance's display label…
    const group = el.querySelector('section[aria-label="کارت عنوان fields"]');
    expect(group).not.toBeNull();
    // …and contains the nested comp's fields as real controls.
    expect(group?.querySelector('input[aria-label="name"]')).not.toBeNull();
    expect(group?.querySelector('input[aria-label="role"]')).not.toBeNull();
  });

  it('seeds each control from the value at its NAMESPACED path', async () => {
    const el = await render(NESTED_TEMPLATE);
    const name = el.querySelector<HTMLInputElement>('input[aria-label="name"]');
    expect(name?.value).toBe('نام');
  });

  it('an edit stages at the namespaced path and applies under the binding key', async () => {
    const el = await render(NESTED_TEMPLATE);
    const name = el.querySelector<HTMLInputElement>('input[aria-label="name"]');
    if (name === null) throw new Error('nested field control missing');

    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(name, 'خبر فوری');
      name.dispatchEvent(new Event('input', { bubbles: true }));
      await Promise.resolve();
    });

    // Staged at ['card','name'] — NOT at a flat top-level 'name'.
    const payload = buildApplyPayload('item-1', item().fields);
    expect(valueAt(payload, ['card', 'name'])).toBe('خبر فوری');
    expect(payload['name']).toBeUndefined();
    // The un-edited sibling in the same namespace survives.
    expect(valueAt(payload, ['card', 'role'])).toBe('سمت');
  });
});

function captionTemplate(): TemplateInfo {
  const resolution = { width: 1920, height: 1080 };
  const frames = [
    { id: 'frame-studio', title: 'استودیو', additionalTexts: [{ id: 'role', text: 'مجری' }] },
    { id: 'frame-local', title: 'Local camera' },
    { id: 'frame-remote', title: 'Remote camera' },
  ];
  const presets: ControlLiveLayout['presets'] = ['preset-1', 'preset-2'].map((id) => ({
    id,
    name: id,
    frameIds: frames.map((frame) => frame.id),
    arrangement: 'side-by-side',
    horizontalGap: 8,
    verticalGap: 8,
    reverse: false,
    hiddenTitles: [],
    hiddenFocusTitles: [],
  }));
  const layout: ControlLiveLayout = {
    id: NESTED_TEMPLATE.templateId,
    name: 'Panel',
    resolution,
    frameRate: 25,
    frames,
    presets,
    defaultPresetId: 'preset-1',
    background: { kind: 'none' },
    effects: CONTROL_LIVE_LAYOUT_DEFAULT_EFFECTS,
  };
  const frameGroups: CompositionFieldGroup[] = frames.map((frame) => ({
    instanceId: 'instance-' + frame.id,
    name: frame.id,
    label: frame.id,
    compositionId: 'layout-frame-' + frame.id,
    aggregate: {
      fields: [
        { id: 'title', type: 'text', label: 'Title', required: false, default: frame.title },
        ...(frame.additionalTexts ?? []).map(({ id, text }) => ({
          id: 'text-' + id,
          type: 'text' as const,
          label: 'Text 2',
          required: false,
          default: text,
        })),
      ],
      groups: [],
    },
  }));
  return {
    ...NESTED_TEMPLATE,
    groups: presets.map(({ id }) => ({
      instanceId: 'layout-look-' + id,
      name: id,
      label: id,
      compositionId: 'layout-look-' + id + '-contents',
      aggregate: { fields: [], groups: frameGroups },
    })),
    controlLiveLayout: layout,
    liveSources: {
      resolution,
      defaultPosition: { anchor: 'center', offset: { x: 0, y: 0 } },
      sources: [],
      defaultLookId: layout.defaultPresetId,
      looks: presets.map(({ id }) => ({
        id,
        name: id,
        instanceId: 'layout-look-' + id,
        entered: { mode: 'cut' },
        rects: {},
      })),
    },
    sharedFrameTitles: frames.map(({ id }) => presets.map((preset) => [preset.id, id, 'title'])),
  };
}

describe('CG Control layout captions in the inspector', () => {
  const caption = (root: HTMLElement, frame: string, field = 'title'): HTMLInputElement => {
    const input = root.querySelector<HTMLInputElement>(
      `section[aria-label="frame-${frame} fields"] [aria-label="${field}"]`,
    );
    if (input === null) throw new Error('Missing caption input');
    return input;
  };

  async function typeCaption(input: HTMLInputElement, value: string): Promise<void> {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    await act(async () => {
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  it('displays missing titles and additional text from the layout while preserving saved blanks and overrides', async () => {
    const selected = {
      ...item(),
      fields: {
        'preset-1': {
          'frame-local': { title: '' },
          'frame-remote': { title: 'Operator title' },
        },
      },
    };
    const el = await render(captionTemplate(), selected);
    expect(caption(el, 'studio').value).toBe('استودیو');
    expect(caption(el, 'studio', 'text-role').value).toBe('مجری');
    expect(caption(el, 'local').value).toBe('');
    expect(caption(el, 'remote').value).toBe('Operator title');
    expect(buildApplyPayload(selected.itemId, selected.fields)).toEqual(selected.fields);
  });

  it('stages an explicit blank across the plate looks and restores inheritance on Discard or revert', async () => {
    const selected = { ...item(), fields: {} };
    const el = await render(captionTemplate(), selected);
    await typeCaption(caption(el, 'studio'), '');
    expect(buildApplyPayload(selected.itemId, selected.fields)).toEqual({
      'preset-1': { 'frame-studio': { title: '' } },
      'preset-2': { 'frame-studio': { title: '' } },
    });
    await act(async () =>
      el.querySelector<HTMLButtonElement>('[data-look-tab="preset-2"]')?.click(),
    );
    expect(caption(el, 'studio').value).toBe('');
    await act(async () =>
      el.querySelector<HTMLButtonElement>('[aria-label="Discard staged edits"]')?.click(),
    );
    expect(caption(el, 'studio').value).toBe('استودیو');
    expect(buildApplyPayload(selected.itemId, selected.fields)).toEqual({});

    await typeCaption(caption(el, 'studio'), 'A staged title');
    await typeCaption(caption(el, 'studio'), 'استودیو');
    expect(caption(el, 'studio').value).toBe('استودیو');
    expect(buildApplyPayload(selected.itemId, selected.fields)).toEqual({});
  });
});

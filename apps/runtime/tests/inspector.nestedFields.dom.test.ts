// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import type { TemplateInfo } from '@cg/shared-ipc';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import {
  __resetDraftsForTest,
  buildApplyPayload,
  valueAt,
} from '../src/renderer/features/inspector/draftStore.js';
import { connectionsStub, linkFor } from './support/reachability.js';

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
          { id: 'name', type: 'text', label: 'Name', default: 'نام' },
          { id: 'role', type: 'text', label: 'Role', default: 'سمت' },
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

async function render(info: TemplateInfo): Promise<HTMLDivElement> {
  const stub = {
    // §0a — BOTH hops, selected by name (support/reachability.ts). `link` is
    // needed too: the health snapshot rides `useBridgeSnapshot`, which reads it.
    link: { status: () => linkFor('both-up'), onStatusChanged: () => () => undefined },
    connections: connectionsStub('both-up'),
    templates: {
      get: vi.fn(() => Promise.resolve(info)),
      list: vi.fn(() => Promise.resolve([info])),
    },
    stack: { setPosition: vi.fn(() => Promise.resolve({ ok: true })) },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;

  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(Inspector, {
          item: item(),
          onApply: () => Promise.resolve({ accepted: true }),
          onDiscard: () => undefined,
        }),
      ),
    );
    await Promise.resolve();
  });
  return container;
}

describe('B-067 — the Inspector renders nested-composition fields', () => {
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

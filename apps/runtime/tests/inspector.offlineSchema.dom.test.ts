// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { __resetDraftsForTest } from '../src/renderer/features/inspector/draftStore.js';
import { connectionsStub, linkFor } from './support/reachability.js';

/**
 * B-085 — the Inspector's `templates.get` is browser-local now and resolves offline. As a
 * belt-and-braces guard the `.then` gained a rejection handler: a failed lookup must NEVER
 * become an unhandled promise rejection, and the Inspector must fall back to the
 * type-inferred fields (from the item's own values) rather than rendering empty or throwing.
 */

let container: HTMLDivElement | null = null;
const rejections: unknown[] = [];
const onRejection = (err: unknown): void => {
  rejections.push(err);
};

beforeEach(() => {
  __resetDraftsForTest();
  rejections.length = 0;
  process.on('unhandledRejection', onRejection);
});

afterEach(() => {
  process.off('unhandledRejection', onRejection);
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function item(): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: { title: 'خبر فوری', subtitle: 'زیرنویس' },
    status: 'loaded',
    pending: false,
  };
}

async function renderWithGet(get: () => Promise<unknown>): Promise<HTMLDivElement> {
  const stub = {
    // §0a — BOTH hops, selected by name (support/reachability.ts). `link` is
    // needed too: the health snapshot rides `useBridgeSnapshot`, which reads it.
    link: { status: () => linkFor('both-up'), onStatusChanged: () => () => undefined },
    connections: connectionsStub('both-up'),
    templates: { get: vi.fn(get) },
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
  // Let the get() microtask settle (resolve or reject) before asserting.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return container;
}

describe('Inspector offline field schema — B-085', () => {
  it('a REJECTED templates.get produces no unhandled rejection and falls back to inferred fields', async () => {
    const el = await renderWithGet(() => Promise.reject(new Error('offline lookup failed')));

    // No unhandled rejection escaped the component.
    expect(rejections).toEqual([]);
    // Fell back to the type-inferred fields from the item's own values (not "No fields.").
    expect(el.querySelector('input[aria-label="title"]')).not.toBeNull();
    expect(el.querySelector('input[aria-label="subtitle"]')).not.toBeNull();
    expect(el.textContent).not.toContain('No fields.');
  });

  it('a resolved local templates.get renders the registry field schema', async () => {
    const el = await renderWithGet(() =>
      Promise.resolve({
        templateId: 'tpl-1',
        name: 'Breaking News',
        templateType: 'lower-third',
        fields: [{ id: 'title', type: 'text', label: 'Headline', default: '' }],
      }),
    );

    expect(rejections).toEqual([]);
    // The schema's label drives the row, proving the local get was used.
    expect(el.textContent).toContain('Headline');
    expect(el.querySelector('input[aria-label="title"]')).not.toBeNull();
  });
});

import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { vi } from 'vitest';
import type { FixedSlotState, TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LayerRow } from '../../src/renderer/features/layers/LayerRow.js';

/**
 * R-028 part B — the shared harness for LayerRow DOM tests.
 *
 * The row calls `window.cg.stack.*` itself (the old StackRow took handlers as
 * props), so the stub IS the wire here: a test asserts what the row dispatches
 * by reading these spies.
 */

export type Link = 'live' | 'disconnected' | 'offline-mock';

export interface RowStubs {
  take: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  out: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
}

export function itemWith(
  status: StackItemState['status'],
  over: Partial<StackItemState> = {},
): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: { title: 'عنوان' },
    status,
    pending: false,
    slot: { channel: 1, layer: 70, server: 'primary' },
    ...over,
  };
}

export function slotWith(over: Partial<FixedSlotState> = {}): FixedSlotState {
  return {
    channel: 1,
    layer: 70,
    alias: 'CLOCK',
    observed: { kind: 'producer', producer: 'html' },
    binding: { itemId: 'item-1', templateType: 'clock', templateId: 'tpl-1' },
    ...over,
  };
}

export function templateWith(over: Partial<TemplateInfo> = {}): TemplateInfo {
  return {
    templateId: 'tpl-1',
    name: 'Lower third',
    templateType: 'clock',
    fields: [],
    ...over,
  };
}

export function stubBridge(link: Link): RowStubs {
  const stubs: RowStubs = {
    take: vi.fn(() => Promise.resolve({ accepted: true })),
    next: vi.fn(() => Promise.resolve({ accepted: true })),
    stop: vi.fn(() => Promise.resolve({ accepted: true })),
    out: vi.fn(() => Promise.resolve({ accepted: true })),
    remove: vi.fn(() => Promise.resolve({ accepted: true })),
    update: vi.fn(() => Promise.resolve({ accepted: true })),
    list: vi.fn(() => Promise.resolve([])),
  };
  const cg = {
    link: { status: () => link, onStatusChanged: () => () => undefined },
    stack: {
      take: stubs.take,
      next: stubs.next,
      stop: stubs.stop,
      out: stubs.out,
      remove: stubs.remove,
    },
    templates: { list: stubs.list, onChanged: () => () => undefined },
  };
  (window as unknown as { cg: typeof cg }).cg = cg;
  return stubs;
}

export interface RenderedRow {
  container: HTMLDivElement;
  root: Root;
  stubs: RowStubs;
  /** Button label → disabled. */
  buttons: () => Map<string, boolean>;
  unmount: () => Promise<void>;
}

export async function renderLayerRow(options: {
  item?: StackItemState | null;
  slot?: FixedSlotState;
  template?: TemplateInfo | null;
  link?: Link;
  dirty?: boolean;
  onUpdate?: (itemId: string) => Promise<{ accepted: boolean }>;
}): Promise<RenderedRow> {
  const link = options.link ?? 'live';
  const stubs = stubBridge(link);
  const item = options.item === undefined ? itemWith('loaded') : options.item;
  const slot =
    options.slot ??
    (item === null ? slotWith({ binding: null, observed: { kind: 'empty' } }) : slotWith());
  const template = options.template === undefined ? templateWith() : options.template;

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(LayerRow, {
          slot,
          item,
          template,
          selected: false,
          dirty: options.dirty ?? false,
          onSelect: () => undefined,
          onUpdate: options.onUpdate ?? stubs.update,
        }),
      ),
    );
  });

  return {
    container,
    root,
    stubs,
    buttons: () => {
      const map = new Map<string, boolean>();
      for (const btn of container.querySelectorAll('button')) {
        map.set(btn.textContent ?? '', btn.disabled);
      }
      return map;
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

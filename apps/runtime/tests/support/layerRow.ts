import { StrictMode, createElement } from 'react';
import { connectionsStub, type Reachability } from './reachability.js';
export type { Reachability };
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { vi } from 'vitest';
import type { FixedSlotState, TemplateInfo } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { LayerRow } from '../../src/renderer/features/layers/LayerRow.js';
import { resolveRowBinding, type RowBinding } from '../../src/renderer/features/layers/rowState.js';
import type { LayerRowActionDeps } from '../../src/renderer/features/layers/layerRowActions.js';

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

/**
 * The row's three-way fact, built the way the PANEL builds it.
 *
 * Specs used to hand `layerRowActions` an `item: StackItemState | null`, and that
 * nullable is exactly what the union replaced: it cannot tell "no template bound"
 * from "the stack has not arrived", and those two must offer opposite verbs. A spec
 * that still expressed a row as a nullable could not describe the `awaiting` window
 * at all — so this helper is the only way a spec names a row's binding, and the
 * third case is reachable by name rather than by omission.
 */
export function bindingFor(item: StackItemState | null): RowBinding {
  return item === null ? { kind: 'unbound' } : { kind: 'bound', item };
}

/** The row does not yet know what it carries — the bootstrap/reconnect window. */
export const AWAITING: RowBinding = { kind: 'awaiting' };

/**
 * The deps for one row's verbs, defaulted — so a spec states only what it is about.
 *
 * Every field is overridable; `binding` is the one a spec almost always sets, and
 * it is the ONLY input to what the row offers.
 */
export function rowDeps(over: Partial<LayerRowActionDeps> = {}): LayerRowActionDeps {
  const binding = over.binding ?? bindingFor(itemWith('loaded'));
  return {
    binding,
    observed: binding.kind === 'bound' ? { kind: 'producer', producer: 'html' } : { kind: 'empty' },
    hasNext: false,
    linkDown: false,
    casparReach: 'reachable',
    dirty: false,
    rehearsing: false,
    // R-021 stage 4 — a spec that is ABOUT the blocked row sets this AND the
    // matching observation; every other spec describes a row whose restore was
    // never parked, which is the ordinary case.
    restoreBlocked: false,
    templateAvailable: true,
    toggleRehearse: () => Promise.resolve({ accepted: true }),
    load: () => Promise.resolve({ accepted: true }),
    reload: () => Promise.resolve({ accepted: true }),
    play: () => Promise.resolve({ accepted: true }),
    next: () => Promise.resolve({ accepted: true }),
    update: () => Promise.resolve({ accepted: true }),
    stop: () => Promise.resolve({ accepted: true }),
    clear: () => Promise.resolve({ accepted: true }),
    clearLayer: () => Promise.resolve({ accepted: true }),
    remove: () => Promise.resolve({ accepted: true }),
    // R-048 (6.9) — the default row's template declares NO live plates, which is
    // the ordinary case; a spec about the swap says so explicitly.
    hasLivePlates: false,
    swapSource: () => Promise.resolve({ accepted: true }),
    plateAudio: () => Promise.resolve({ accepted: true }),
    onError: () => undefined,
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

export function stubBridge(link: Link, reach: Reachability = 'both-up'): RowStubs {
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
    // §0a — the second hop, selected BY NAME. See `support/reachability.ts`.
    connections: connectionsStub(reach),
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
  bankPosition?: number;
  /** Render the row as already SELECTED (drives the toggle-select assertions). */
  selected?: boolean;
  /** Observe what a row click reports back to the panel. */
  onSelect?: (itemId: string | null) => void;
  onUpdate?: (itemId: string) => Promise<{ accepted: boolean }>;
  /**
   * THE SECOND HOP, selected by name (see `support/reachability.ts`).
   *
   * Defaults to `both-up`. A spec about the BOOT WINDOW passes `unknown`, which
   * is the state `useConnections()` is genuinely in until the bridge first
   * answers — and it must be paired with a LIVE link, because with the link down
   * there is no round trip to be waiting on and the row reports the nearer hop.
   */
  reach?: Reachability;
  /**
   * Has the STACK snapshot arrived? Defaults to TRUE, because every spec here
   * except the loading ones is about a settled panel.
   *
   * It is threaded rather than hard-coded so the awaiting state is reachable from
   * this harness at all: a bound slot plus `stackReady: false` is exactly the
   * bootstrap window, and it is the one combination that must NOT read as EMPTY.
   */
  stackReady?: boolean;
  /**
   * 🔴 **SESSION BR — REQUIRED BY `LayerRow`, AND THIS HARNESS NEVER PASSED IT.**
   *
   * `rehearsing` is a required prop; the render below omitted it, so every spec built
   * through this helper has rendered with it `undefined` — falsy. **The DOM-level
   * rehearsing appearance was therefore UNREACHABLE from this harness**, and no spec using
   * it has ever asserted anything about a row on PVW. (R-022’s rehearse behaviour IS
   * covered, but through `layerRowActions` directly — the pure function, not the render.)
   *
   * Exposed here so the state is reachable at all. It defaults to `false`, which is exactly
   * what every existing spec was already getting, so nothing that passes today changes.
   * ⚠ Nothing uses it yet: naming the visual a rehearsing row SHOULD have is a judgement
   * this session did not make. Recorded as a gap rather than guessed at.
   */
  rehearsing?: boolean;
  /** `LayerRow`’s display index. Was passed below but never declared here. */
  displayPosition?: number;
  /**
   * `add-multibox-audio` — the LIVE PLATES this row's item owns, for the read-only audio
   * summary. Defaults to none, which is every row that has no live plates — the ordinary case.
   */
  seatedPlates?: readonly string[];
}): Promise<RenderedRow> {
  const link = options.link ?? 'live';
  const stubs = stubBridge(link, options.reach ?? 'both-up');
  const item = options.item === undefined ? itemWith('loaded') : options.item;
  const slot =
    options.slot ??
    (item === null ? slotWith({ binding: null, observed: { kind: 'empty' } }) : slotWith());
  // Built through the SAME resolver the panel uses, so the harness cannot express
  // a binding the product could not produce.
  const binding = resolveRowBinding(
    slot.binding,
    item === null ? undefined : item,
    options.stackReady ?? true,
  );
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
          // The row takes its item OUT of the binding now — there is no `item` prop
          // to pass, which is what stops a verb asking a nullable what it carries.
          binding,
          template,
          // A standalone row is the first row AND the bank's first position; specs
          // that care about the difference drive the panel, not one row.
          displayPosition: options.displayPosition ?? 1,
          rehearsing: options.rehearsing ?? false,
          bankPosition: options.bankPosition ?? 1,
          selected: options.selected ?? false,
          dirty: options.dirty ?? false,
          seatedPlates: options.seatedPlates ?? [],
          onSelect: options.onSelect ?? ((): void => undefined),
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

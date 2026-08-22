// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { Inspector } from '../src/renderer/features/inspector/Inspector.js';
import { PositionPicker } from '../src/renderer/features/inspector/PositionPicker.js';
import {
  onCommandError,
  reportCommandError,
} from '../src/renderer/features/status/commandFeedback.js';
import { connectionsStub, linkFor } from './support/reachability.js';

/**
 * #334 finished the migration to toast-only feedback for the Library and Stack rows, but the
 * Inspector was left behind: its Update button had NO `onError`, so a failure rendered the
 * inline `.cg-btn-error` beside the control — while `applyDraft` had ALREADY toasted the same
 * failure. Two messages for one refusal. `Apply position` had the opposite half of the
 * problem: inline only, never reaching the toast at all.
 *
 * These pin both halves: nothing inline, exactly one toast, same wording.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  container?.remove();
  container = null;
});

function itemWith(status: StackItemState['status'] = 'on-air'): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: { title: 'عنوان' },
    status,
    pending: false,
    slot: { channel: 1, layer: 10, server: 'primary' },
  };
}

/** The slice of `window.cg` these panels touch. */
function stubBridge(over: Record<string, unknown> = {}): void {
  const stub = {
    // §0a — BOTH hops, selected by name (support/reachability.ts). `link` is
    // needed too: the health snapshot rides `useBridgeSnapshot`, which reads it.
    //
    // ⚠ SESSION BR — a SECOND `link` key sat above this one, with `status: () => 'live'`.
    // The later key wins in an object literal, so the first was dead and this one is what
    // every spec in the file has actually been running against. Removing the dead copy is
    // behaviour-identical; leaving two keys with DIFFERENT values would not have stayed that
    // way.
    link: {
      status: () => linkFor('both-up'),
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: connectionsStub('both-up'),
    templates: { get: () => Promise.resolve(null), list: () => Promise.resolve([]) },
    stack: {
      setPosition: () => Promise.resolve({ ok: true }),
      update: () => Promise.resolve({ accepted: true }),
      ...over,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function render(element: ReturnType<typeof createElement>): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
  });
}

async function clickByLabel(label: string): Promise<void> {
  const btn = container?.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (btn === null || btn === undefined) throw new Error(`no button labelled ${label}`);
  await act(async () => {
    btn.click();
  });
  // Let the round-trip settle, then the controller's finish step.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** Anything the AsyncButton would have pinned beside the control. */
function inlineErrors(): string[] {
  return [...(container?.querySelectorAll('.cg-btn-error') ?? [])].map(
    (el) => el.textContent ?? '',
  );
}

describe('Inspector feedback is toast-only (#334)', () => {
  it('a refused Apply position TOASTS and pins nothing inline', async () => {
    const messages: string[] = [];
    const unsub = onCommandError((m) => messages.push(m));
    try {
      // R-011 — refused while the item is on air. `setPosition` does NOT self-report, so
      // this button is the only reporter: the toast must carry it.
      stubBridge({ setPosition: () => Promise.resolve({ ok: false, reason: 'unknown-item' }) });
      await render(createElement(PositionPicker, { item: itemWith('loaded') }));

      await clickByLabel('Apply position');

      expect(messages).toHaveLength(1);
      // Placement moved; the WORDING is the same mapping the inline message used.
      expect(messages[0]).toBe('That item is no longer on the stack.');
      expect(inlineErrors()).toEqual([]);
    } finally {
      unsub();
    }
  });

  it('an accepted Apply position says nothing at all', async () => {
    const messages: string[] = [];
    const unsub = onCommandError((m) => messages.push(m));
    try {
      stubBridge({ setPosition: () => Promise.resolve({ ok: true }) });
      await render(createElement(PositionPicker, { item: itemWith('loaded') }));

      await clickByLabel('Apply position');

      expect(messages).toEqual([]);
      expect(inlineErrors()).toEqual([]);
    } finally {
      unsub();
    }
  });
});

describe('the applyDraft path toasts exactly ONCE', () => {
  it('a refused Update produces ONE toast (applyDraft owns it) and nothing inline', async () => {
    const messages: string[] = [];
    const unsub = onCommandError((m) => messages.push(m));
    try {
      stubBridge();
      // Stands in for the wired `applyDraft`, whose contract this button depends on: it
      // REPORTS the failure itself and then rejects. The button must add NO second report
      // and pin NO inline message — otherwise one refusal speaks twice, which is the bug.
      const onApply = vi.fn((): Promise<{ accepted: boolean }> => {
        reportCommandError('Update failed.'); // applyDraft's own toast
        return Promise.reject(new Error('Update failed.'));
      });

      await render(
        createElement(Inspector, {
          item: itemWith(),
          onApply,
          onDiscard: () => undefined,
        }),
      );

      await clickByLabel('Apply staged edits');

      expect(onApply).toHaveBeenCalledTimes(1);
      // Exactly ONE message — the handler's own. The button contributed neither a
      // duplicate toast nor an inline copy.
      expect(messages).toEqual(['Update failed.']);
      expect(inlineErrors()).toEqual([]);
    } finally {
      unsub();
    }
  });
});

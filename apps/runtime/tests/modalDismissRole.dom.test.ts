// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { FixedBankConfigModal } from '../src/renderer/features/fixedLayers/FixedBankConfigModal.js';
import { SourcesModal } from '../src/renderer/features/sources/SourcesModal.js';
import { DelimitersModal } from '../src/renderer/features/inspector/DelimitersModal.js';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { __resetDelimitersForTest } from '../src/renderer/features/inspector/delimiterStore.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * **A BUTTON THAT DISMISSES AND COMMITS NOTHING IS `cancel`, IN EVERY DIALOG.**
 *
 * The rule is the owner's and it was already written down — at `AuditPanel.tsx`, in the
 * footer it governs:
 *
 * > ONE action, and its role is `cancel` — not `primary` (owner). `Close` DISMISSES; it
 * > commits nothing. […] Same treatment as every other Cancel, which is the point: the
 * > operator learns one shape for "get me out of here".
 *
 * Three dialogs disagreed with it, and each had arrived at `primary` independently:
 * `Candidate layers — not configured` (`Close`), `Live sources` (`Done`) and
 * `Text file delimiters` (`Done`). A rule stated in ONE component's comment is a rule the
 * next dialog cannot find, which is how all three got there — so it is asserted here and
 * written into the spec (`openspec/specs/runtime-ui`), not left in a comment.
 *
 * ── WHY THESE THREE ARE COVERED BY IT, WHICH IS THE PART WORTH CHECKING ─────
 *
 * `Live sources` and `Text file delimiters` COMMIT AS YOU GO — `commitCatalog` and
 * `resetDelimiters` fire on their own controls, as the operator presses them. So by the
 * time the footer is reached there is nothing left to commit, and their `Done` is a
 * dismissal wearing the word "Done": `onClick={onClose}` and nothing else, verified below
 * rather than assumed. The rule is about what the button DOES.
 *
 * ⭐ **THE LABELS ARE DELIBERATELY UNCHANGED.** `Done` is honest for a dialog you commit
 * through and then leave, and the rule the owner wrote is about the ROLE — which is what
 * carries the treatment. Seven Playwright steps across three specs click these buttons by
 * accessible name; changing the words would have churned all of them to say nothing new.
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
  clearPortals();
  __resetSourcesForTest();
  __resetDelimitersForTest();
  vi.restoreAllMocks();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('the dialog did not open');
  return dialog;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

/**
 * The dialog's LAST footer action — the one in the primary corner, since the row is
 * right-aligned and cancel-first in DOM order puts the committing action at the end.
 */
function lastFooterAction(dialog: HTMLElement): HTMLElement {
  const buttons = [...dialog.querySelectorAll<HTMLElement>('.cg-modal-footer button')];
  const last = buttons[buttons.length - 1];
  if (last === undefined) throw new Error('the dialog has no footer actions');
  return last;
}

/**
 * The one check. Both halves matter and neither implies the other: the ROLE is what
 * carries the treatment, and `onClick === onClose` is what makes the role CORRECT. A
 * button that committed something and wore `cancel` would be a worse defect than the one
 * being fixed — the operator would read "this is safe" on the control that is not.
 */
function expectDismissOnly(dialog: HTMLElement, label: string, onClose: () => void): void {
  const button = lastFooterAction(dialog);
  expect(button.textContent, 'the label is unchanged').toBe(label);
  expect(button.getAttribute('data-modal-role'), `${label} is not a dismissal`).toBe('cancel');
  expect(button.className, `${label} still wears the primary treatment`).toContain(
    'cg-btn--neutral',
  );

  // …and pressing it does exactly one thing: dismiss.
  act(() => {
    button.click();
  });
  expect(onClose).toHaveBeenCalledTimes(1);
}

describe('a dismiss-only footer is `cancel` — the rule AuditPanel states, applied everywhere', () => {
  it('the REFERENCE: the audit log already obeys it (the positive control)', async () => {
    // Asserted first and deliberately: it is the dialog the rule is written on, so if this
    // one ever failed the rule itself would have moved, and the three below would be
    // enforcing something nobody decided.
    (window as unknown as { cg: unknown }).cg = {
      audit: {
        recent: () => Promise.resolve([]),
        health: () => Promise.resolve({ path: null, writable: false, lastError: null }),
        // `B-141` — the panel reads the acting console's self-declared name on open.
        operatorName: () => '',
        setOperatorName: () => undefined,
      },
      templates: { list: () => Promise.resolve([]) },
      fixedLayers: {
        config: () => Promise.resolve(null),
        onConfigChanged: () => () => undefined,
      },
    };
    const onClose = vi.fn();
    const dialog = await render(createElement(AuditPanel, { open: true, onClose }));
    await settle();
    expectDismissOnly(dialog, 'Close', onClose);
  });

  it('🔴 Candidate layers — not configured: Close DISMISSES, so it is not a primary', async () => {
    // The `bank: null` branch — an explainer with nothing to apply. Its Close had the
    // weight of "the action this dialog exists to perform" on a button that performs none.
    (window as unknown as { cg: unknown }).cg = {};
    const onClose = vi.fn();
    const dialog = await render(
      createElement(FixedBankConfigModal, { bank: null, slots: [], onClose }),
    );
    await settle();
    expectDismissOnly(dialog, 'Close', onClose);
  });

  it('🔴 Live sources: Done commits nothing — the catalog is committed as you go', async () => {
    (window as unknown as { cg: unknown }).cg = {
      sources: {
        config: () => Promise.resolve({ sources: [] }),
        onConfigChanged: () => () => undefined,
        setConfig: () => Promise.resolve({ ok: true }),
        assignments: () => Promise.resolve({ assignments: [] }),
        onAssignmentsChanged: () => () => undefined,
        setAssignments: () => Promise.resolve({ ok: true }),
      },
      templates: { list: () => Promise.resolve([]) },
    };
    const onClose = vi.fn();
    const dialog = await render(createElement(SourcesModal, { onClose }));
    await settle();
    expectDismissOnly(dialog, 'Done', onClose);
  });

  it('🔴 Text file delimiters: Done commits nothing — every edit already went to the bridge', async () => {
    (window as unknown as { cg: unknown }).cg = {
      delimiters: {
        list: () => Promise.resolve({ delimiters: [] }),
        onChanged: () => () => undefined,
        set: () => Promise.resolve({ ok: true }),
      },
    };
    const onClose = vi.fn();
    const dialog = await render(createElement(DelimitersModal, { onClose }));
    await settle();
    expectDismissOnly(dialog, 'Done', onClose);
  });

  it('a dialog that DOES commit keeps its primary — the rule does not neutralise real actions', async () => {
    /*
      🔴 THE NEGATIVE CONTROL, and without it this file would be enforcing "no dialog has a
      primary action", which is a different and much worse rule.

      `Candidate layers` WITH a bank has an Apply that sends `fixedLayers.setConfig`. It is
      the same component as the `bank: null` case above — one prop apart — so this pins the
      distinction exactly where it is subtle: the role follows what the button DOES, not
      which dialog it is in.
    */
    (window as unknown as { cg: unknown }).cg = {
      link: {
        status: () => 'live',
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
      stack: { snapshot: () => Promise.resolve([]), onStateChanged: () => () => undefined },
      fixedLayers: { setConfig: () => Promise.resolve({ ok: true }) },
    };
    const dialog = await render(
      createElement(FixedBankConfigModal, {
        bank: { channel: 1, low: { start: 1, count: 9 }, start: 70, count: 3, aliases: {} },
        slots: [],
        onClose: () => undefined,
      }),
    );
    await settle();
    const apply = lastFooterAction(dialog);
    expect(apply.textContent).toBe('Apply');
    expect(apply.getAttribute('data-modal-role')).toBe('primary');
  });
});

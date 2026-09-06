// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { __resetDelimitersForTest } from '../src/renderer/features/inspector/delimiterStore.js';
import { clearPortals, openDialog } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  selectSetupTab,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * `runtime-modal-contract` — **a footer button that dismisses and commits nothing is `cancel`.**
 *
 * The rule was written on ONE dialog (`AuditPanel.tsx`'s footer comment) and three others
 * disagreed with it — each gave a button that only CLOSES the `primary` treatment, which
 * asserts "this is the action the dialog exists to perform". A rule stated in one
 * component's comment is a rule the next dialog cannot find; it now lives in the spec
 * (`openspec/specs/runtime-ui`), and this file enforces it against the tree.
 *
 * ── `STATION-SETUP-02` — THE THREE DIALOGS BECAME SECTIONS, AND THE RULE SHARPENED ──
 *
 * `Candidate layers — not configured` (Close), `Live sources` (Done) and `Text file
 * delimiters` (Done) are sections of Station setup now, and they have no footer of their
 * own. What the contract says about the ONE footer they share:
 *
 *   - Cancel DISMISSES and commits nothing — `cancel`, neutral, and pressing it does one
 *     thing. The sections that save as they go are already saved; the Servers draft is
 *     dropped. Same rule, same treatment.
 *   - APPLY SERVERS commits the Servers section — `primary`, and named for its SCOPE, so it
 *     cannot read as covering the six sections it does not touch.
 *   - The sections that commit from the BODY (the raster's per-channel button, the bank's
 *     `Apply candidate layers`) put their committing control IN THE BODY and grow no footer
 *     that implies otherwise — asserted below as the negative control, because a footer
 *     with three primaries would be the drift this file exists to catch.
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
  await unmountStationSetup();
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

function footerActions(dialog: HTMLElement): HTMLButtonElement[] {
  return [...dialog.querySelectorAll<HTMLButtonElement>('.cg-modal-footer button')];
}

/** The LAST action in the footer — the corner every dialog's primary (or sole) action sits in. */
function lastFooterAction(dialog: HTMLElement): HTMLButtonElement {
  const buttons = footerActions(dialog);
  const last = buttons[buttons.length - 1];
  if (last === undefined) throw new Error('the dialog has no footer action');
  return last;
}

/**
 * The claim, made the same way for every dismissal: the button carries the `cancel` role, the
 * neutral treatment (never the primary's), and pressing it does exactly one thing.
 */
function expectDismissOnly(button: HTMLButtonElement, label: string, onClose: () => void): void {
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
    // one ever failed the rule itself would have moved, and the rest would be enforcing
    // something nobody decided.
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
    expectDismissOnly(lastFooterAction(dialog), 'Close', onClose);
  });

  it('🔴 Station setup: Cancel DISMISSES — the Servers draft is dropped, nothing is sent, the saved sections stay saved', async () => {
    const stub = stationSetupStub();
    const onClose = vi.fn();
    // The SERVERS tab: it is the only one with a draft, so it is the only one whose
    // dismissing button can be called Cancel at all.
    const dialog = await renderStationSetup({ section: 'servers', onClose });
    const cancel = footerActions(dialog).find((b) => b.textContent === 'Cancel');
    if (cancel === undefined) throw new Error('no Cancel in the footer');
    expectDismissOnly(cancel, 'Cancel', onClose);
    expect(stub.setConfig).not.toHaveBeenCalled();
    expect(stub.fixedSetConfig).not.toHaveBeenCalled();
    expect(stub.rasterSet).not.toHaveBeenCalled();
    expect(stub.sourcesSetConfig).not.toHaveBeenCalled();
    expect(stub.delimitersSet).not.toHaveBeenCalled();
  });

  it('a dialog that DOES commit keeps its primary — the rule does not neutralise real actions', async () => {
    /*
      🔴 THE NEGATIVE CONTROL, and without it this file would be enforcing "no dialog has a
      primary action", which is a different and much worse rule.

      APPLY SERVERS sends `connections.setConfig`. It keeps the `primary` role — and it is
      named for the ONE section it commits, because four other tabs sit beside it.
    */
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'servers' });
    const apply = lastFooterAction(dialog);
    expect(apply.textContent).toBe('APPLY SERVERS');
    expect(apply.getAttribute('data-modal-role')).toBe('primary');
    expect(apply.getAttribute('aria-label')).toBe('Apply server settings');
  });

  it('🔴 STATION-CHROME-01 §2 — each TAB carries its own footer, and no other tab’s action', async () => {
    /*
      The rule this file guards is unchanged; what changed is that the footer is now PER TAB,
      so it can be checked exactly rather than by counting a shared row.

      · SERVERS is the only tab with an APPLY, and it is named for its scope.
      · The BANK's Apply/Revert are in ITS footer (portalled there from the section) — the
        `STATION-SETUP-02` note said they lived in the body only because "the dialog's footer
        belongs to Servers", and with tabs that is no longer true.
      · Every other tab gets a quiet Close and nothing else: a read-only tab has nothing to
        commit, and a save-as-you-go tab already committed. "Cancel" would be a lie on both.
    */
    stationSetupStub();

    const dialog = await renderStationSetup({ section: 'servers' });
    expect(footerActions(dialog).map((b) => b.textContent)).toEqual(['Cancel', 'APPLY SERVERS']);
    /*
      …then the OTHER tabs, from the SAME dialog, by pressing the rail. Reusing one dialog is
      not convenience: a second `renderStationSetup` leaves the first mounted and
      `openDialog()` hands back the OLDER one, so every assertion after it would silently be
      about the wrong tab — green, and measuring nothing.
    */
    await selectSetupTab(dialog, 'candidate-layers');
    expect(footerActions(dialog).map((b) => b.textContent)).toEqual([
      'Revert',
      'Apply layers',
      'Close',
    ]);
    for (const section of ['channel', 'sources', 'delimiters'] as const) {
      await selectSetupTab(dialog, section);
      expect(
        footerActions(dialog).map((b) => b.textContent),
        `${section} carries a commit action it should not have`,
      ).toEqual(['Close']);
    }
  });

  it('a read-only tab SAYS there is nothing to apply, and the as-you-go tabs say they saved', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'channel' });
    expect(dialog.querySelector('[data-section-footer="channel"]')?.textContent).toContain(
      'Nothing to apply',
    );
    await selectSetupTab(dialog, 'sources');
    expect(dialog.querySelector('[data-section-footer="sources"]')?.textContent).toContain(
      'Saved as you go',
    );
    // …and the section's own legend agrees with its footer.
    expect(sectionOf(dialog, 'sources').textContent).toContain('Saves as you go');
  });
});

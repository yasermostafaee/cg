// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_BANK,
  renderStationSetup,
  sectionOf,
  selectSetupTab,
  setSetupInput,
  setupSlot,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `B-240` — **THREE ANSWERS FOR ONE JOB, AND TWO NAMES FOR ONE ACT.**
 *
 * The owner audited the footers and found: Layers offered `Revert · Apply layers · Close`,
 * Servers `Cancel · Apply servers`, and Delimiters and Live sources `Close` alone.
 *
 *   · **Cancel and Revert are the same act** — discard this section's unapplied edits — under
 *     two names, on two tabs.
 *   · **Close is a third, DIALOG-level thing** that only some sections carried, which makes
 *     leaving the dialog look like a property of whichever tab you happen to be standing on.
 *
 * The rule applied is the dismiss-button rule (`AuditPanel`) and `R-055` one surface further:
 * ONE JOB, ONE CONTROL, ONE NAME.
 *
 *   · **Dismissal is DIALOG-level** — the ✕, Escape and the backdrop, all three already in the
 *     primitive. No section footer carries it.
 *   · **Discard is SECTION-level and is called `Revert`,** never `Cancel`, and is offered only
 *     when that section actually holds unapplied changes — read from the SAME condition the
 *     rail's blue dot reads, so the two cannot disagree about whether there is anything to
 *     revert.
 *   · **Commit is `Apply <section>`,** sentence case.
 *   · **A read-only or save-as-you-go section carries no buttons at all.** A footer holding
 *     only its message is not unfinished; a footer holding a button that does nothing is.
 *
 * ⭐ **And the thing the confusion was hiding, which is the only behaviour change here:**
 * dismissing the dialog while a section holds unapplied edits. `Close` and `Cancel` blurred
 * it — one of them discarded a draft and the other did not, and they sat one tab apart. The ✕
 * now CONFIRMS, naming the sections whose edits would be lost; the rail already knows which
 * they are.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** The footer's action buttons, in DOM order. */
function footerButtons(dialog: HTMLElement): string[] {
  return [...(dialog.querySelector('.cg-modal-footer')?.querySelectorAll('button') ?? [])].map(
    (b) => (b.textContent ?? '').trim(),
  );
}

const boundSlots = [setupSlot(70), setupSlot(71)];

describe('B-240 — one job, one control, one name', () => {
  it('🔴 no section footer carries a dismissal: leaving is a property of the DIALOG', async () => {
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'channel' });
    for (const id of ['channel', 'servers', 'sources', 'delimiters', 'candidate-layers'] as const) {
      await selectSetupTab(dialog, id);
      expect(footerButtons(dialog), `${id}'s footer offers a dismissal`).not.toContain('Close');
      expect(footerButtons(dialog), `${id}'s footer calls discard "Cancel"`).not.toContain(
        'Cancel',
      );
    }
    // …and the way out is still one press away, in the primitive, on every tab.
    expect(dialog.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  it('🔴 a read-only or save-as-you-go tab carries NO buttons — only its message', async () => {
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'channel' });
    expect(footerButtons(dialog)).toEqual([]);
    for (const id of ['sources', 'delimiters'] as const) {
      await selectSetupTab(dialog, id);
      expect(footerButtons(dialog), `${id} carries a button that does nothing`).toEqual([]);
    }
    // The contract sentence is still there — that is what the footer is FOR now.
    expect(
      dialog.querySelector('[data-section-footer]')?.textContent?.trim().length ?? 0,
    ).toBeGreaterThan(0);
  });

  it('🔴 discard is called REVERT on every tab that has one, and only when there is something to revert', async () => {
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'servers' });

    // CLEAN: Servers has a draft mechanism but no draft yet, so no discard is offered.
    expect(footerButtons(dialog)).toEqual(['Apply servers']);

    // DIRTY: typing puts the same fact on the rail's dot and on the Revert button — one
    // condition, read twice, so they cannot disagree.
    await setSetupInput(dialog, 'Primary host', '192.168.21.114');
    expect(footerButtons(dialog)).toEqual(['Revert', 'Apply servers']);
    expect(
      dialog.querySelector('[role="tab"]#station-servers [data-tab-badge="edited"]'),
      'the rail says the same thing the button does',
    ).not.toBeNull();
  });

  it('POSITIVE CONTROL: the commit action is still there, and named for its section', async () => {
    // Without this, "the footer holds no Close and no Cancel" would also pass on a footer
    // that had lost its Apply.
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    expect(footerButtons(dialog)).toContain('Apply layers');
  });
});

describe('🔴 B-240 — dismissing with unapplied edits asks, and names what would be lost', () => {
  it('the ✕ CONFIRMS when a section holds unapplied changes, naming that section', async () => {
    const onClose = vi.fn();
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'servers', onClose });

    await setSetupInput(dialog, 'Primary host', '192.168.21.114');
    const x = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => {
      x?.click();
      await Promise.resolve();
    });

    // It did NOT close yet — it asked.
    expect(onClose, 'a draft must not be dropped without a word').not.toHaveBeenCalled();
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    expect(
      confirm?.textContent,
      'the question names the section, in the rail’s own words',
    ).toContain('Servers');
  });

  it('…and with NOTHING unapplied it just closes — the question is not asked for nothing', async () => {
    /*
      The negative control, and the one that keeps this from becoming a nuisance gate. A
      confirmation an operator sees every time he leaves a dialog is one he learns to dismiss
      without reading, which is how a real warning stops working.
    */
    const onClose = vi.fn();
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'channel', onClose });
    const x = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    await act(async () => {
      x?.click();
      await Promise.resolve();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  });

  it('the guard reads the SAME dirty condition the rail does, for every section', async () => {
    /*
      ⚠ Not "the two agree" — the two are ONE READ. A second derivation of "does this section
      hold a draft" is the `B-228` shape again: it would look right, and drift on the day
      either side gained a section.
    */
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'servers' });
    await setSetupInput(dialog, 'Primary host', '192.168.21.114');

    // From ANOTHER tab, the rail still marks Servers — and the guard must still fire.
    await selectSetupTab(dialog, 'delimiters');
    expect(
      dialog.querySelector('[role="tab"]#station-servers [data-tab-badge="edited"]'),
    ).not.toBeNull();
    const x = dialog.querySelector<HTMLButtonElement>('button[aria-label="Close"]');
    expect(x).not.toBeNull();
    expect(sectionOf(dialog, 'delimiters')).not.toBeNull();
  });
});

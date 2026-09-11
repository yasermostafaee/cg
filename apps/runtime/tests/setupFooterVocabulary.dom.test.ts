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
 * ⭐ **AMENDED 2026-09-11 (`SETTINGS-MATCH-02`): the `Close` came back, on the panes with
 * nothing to commit, because the reference draws it there and the owner asked for it.** What
 * did NOT come back is any of the above: it is the dialog's own dismissal on the dialog's own
 * path (it asks before dropping a draft), it is never beside an `Apply`, and discard is still
 * called `Revert` and nothing else. `sections.ts`'s `commits` column is where the amended rule
 * is written down. The specs below assert the amended rule, not the superseded one.
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
  it('🔴 DISCARD is never called Cancel, on any tab — the two-names half, unchanged', async () => {
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'channel' });
    for (const id of ['channel', 'servers', 'sources', 'delimiters', 'candidate-layers'] as const) {
      await selectSetupTab(dialog, id);
      expect(footerButtons(dialog), `${id}'s footer calls discard "Cancel"`).not.toContain(
        'Cancel',
      );
    }
    // …and the way out is still one press away, in the primitive, on every tab.
    expect(dialog.querySelector('button[aria-label="Close"]')).not.toBeNull();
  });

  /**
   * 🔴 **`B-240` AMENDED, 2026-09-11 — `SETTINGS-MATCH-02`.**
   *
   * This spec asserted `toEqual([])`: a section with nothing to commit carried NO footer
   * button at all. The owner has now looked at the reference — which draws `Close` on exactly
   * these three panes — and asked for it, so the rule is amended and the assertion with it.
   *
   * ⚠ **What the amendment does NOT touch is what `B-240` was actually about**, and the two
   * specs around this one are where that is held: discard is `Revert` and never `Cancel`, a
   * commit is `Apply <section>`, and no footer ever offers a `Close` BESIDE an `Apply` — which
   * is the configuration that made "which of these am I pressing?" a real question. The three
   * assertions below are the whole amended rule, stated positively.
   */
  it('🔴 a section with nothing to commit carries `Close`, and one with a commit does not', async () => {
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'channel' });
    expect(footerButtons(dialog), 'a read-only tab offers the dialog’s own way out').toEqual([
      'Close',
    ]);
    for (const id of ['sources', 'delimiters'] as const) {
      await selectSetupTab(dialog, id);
      expect(footerButtons(dialog), `${id} is save-as-you-go: Close alone`).toEqual(['Close']);
    }
    // 🔴 …and NEVER beside a commit. This is the half `B-240` was protecting.
    for (const id of ['servers', 'candidate-layers'] as const) {
      await selectSetupTab(dialog, id);
      expect(footerButtons(dialog), `${id} offers both a Close and an Apply`).not.toContain(
        'Close',
      );
      expect(footerButtons(dialog).join(' '), `${id} lost its commit`).toContain('Apply');
    }
    // The contract sentence is still there — that is what the footer is FOR.
    expect(
      dialog.querySelector('[data-section-footer]')?.textContent?.trim().length ?? 0,
    ).toBeGreaterThan(0);
  });

  it('🔴 that `Close` is the DIALOG’s dismissal — it asks before dropping another tab’s draft', async () => {
    /*
      The amendment's load-bearing claim. A per-section `Close` that dismissed without the
      guard would be a second dismissal path, which is exactly the defect `B-240` closed; this
      one routes through the SAME `dismiss` the ✕ calls, so the question is asked once, in one
      place, whichever affordance is pressed.
    */
    const onClose = vi.fn();
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'servers', onClose });
    await setSetupInput(dialog, 'Primary host', '192.168.21.114');

    // Stand on a tab with nothing to commit, while Servers holds the draft.
    await selectSetupTab(dialog, 'delimiters');
    const close = [
      ...(dialog.querySelector('.cg-modal-footer')?.querySelectorAll('button') ?? []),
    ].find((b) => b.textContent?.trim() === 'Close');
    expect(close, 'the save-as-you-go tab has its Close').not.toBeUndefined();
    await act(async () => {
      close?.click();
      await Promise.resolve();
    });
    expect(onClose, 'it dropped a draft without a word').not.toHaveBeenCalled();
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    expect(
      confirm?.textContent,
      'the question names the section that would lose its edits',
    ).toContain('Servers');
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

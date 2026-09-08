// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { REMOVE_ON_AIR_CODE } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { REMOVE_ON_AIR_REASON } from '../src/renderer/features/layers/layerRowActions.js';
import { errorCodeMessage } from '../src/renderer/ui/errorCodeMessage.js';
import { STATION_SETUP_SECTIONS } from '../src/renderer/features/stationSetup/sections.js';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_BANK,
  renderStationSetup,
  sectionOf,
  setupSlot,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `B-238` + `B-239` — **THE REFUSAL THAT REACHED NOBODY, AND THE LINE THAT WAS ALREADY
 * STANDING WHERE IT SHOULD HAVE APPEARED.**
 *
 * ── WHAT WAS MEASURED BEFORE ANY OF THIS WAS WRITTEN ────────────────────────
 *
 * Against the running app, on the seeded bank: layer 88 holds `item-blocked-restore`, status
 * `on-air`. Its remove control was ENABLED. Pressing it opened a CONFIRMATION reading _"This
 * item is ON AIR. Removing it CLEARS layer 88"_. Confirming it left the item `on-air` — the
 * bridge refused — and the dialog showed `msg: null`, `notices: []`, and no toast.
 *
 * `window.cg.stack.remove` RESOLVES the refusal rather than throwing:
 *
 *     { accepted: false, errorCode: 'on-air' }
 *
 * and `removeTemplate` reported only from its `catch`. So the seam was missing, not the
 * message: `errorCodeMessage` has mapped `REMOVE_ON_AIR_CODE` to `REMOVE_ON_AIR_REASON` all
 * along, as a computed key.
 *
 * ── THE THREE THINGS THIS FILE PINS ─────────────────────────────────────────
 *
 * 1. **BEFORE the press** — `R-017`: a row that is on air gets a REFUSAL, not a
 *    confirmation. A confirmation asks an operator to authorise damage under time pressure;
 *    the control is dead, with the reason on it.
 * 2. **AFTER the press** — a refusal that arrives anyway is RENDERED, through the same one
 *    sentence. (Reachable by a race, or by another console taking the row to air between the
 *    render and the press — the very paths `errorCodeMessage`'s own note names.)
 * 3. **AT REST** — the Layers footer says nothing, so that an appearing message IS the signal.
 *
 * ⚠ Every identity assertion checks the constant is NON-EMPTY first. An assertion against a
 * constant that does not exist is `expect(undefined).toBe(undefined)`, which passes for the
 * wrong reason and would have passed before this work.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** An item in a given air state, on the bank's first layer. */
const item = (
  status: StackItemState['status'],
  extra: Partial<StackItemState> = {},
): StackItemState =>
  ({
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: {},
    status,
    pending: false,
    ...extra,
  }) as unknown as StackItemState;

const boundSlots = [
  setupSlot(70, {
    itemId: 'item-1',
    templateType: 'clock',
    templateId: 'tpl-1',
    templateName: 'ساعت اذان',
  }),
  setupSlot(71),
];

/** The row's remove control, found by its accessible name. */
function removeButton(section: HTMLElement): HTMLButtonElement | null {
  return section.querySelector<HTMLButtonElement>('button[aria-label^="Remove the template on"]');
}

describe('B-238 §2 — before the press: an on-air row REFUSES, it does not ask', () => {
  it('🔴 the control is DISABLED and carries the one canonical reason', async () => {
    expect(
      REMOVE_ON_AIR_REASON.length,
      'the constant must exist before it can be asserted on',
    ).toBeGreaterThan(0);

    stationSetupStub({ items: [item('on-air')], slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const button = removeButton(sectionOf(dialog, 'candidate-layers'));

    expect(
      button,
      'the row still OFFERS the control — a hidden one teaches nothing',
    ).not.toBeNull();
    expect(button?.disabled, 'R-017: on air is a refusal, not a confirmation').toBe(true);
    expect(button?.getAttribute('title')).toBe(REMOVE_ON_AIR_REASON);
  });

  it('🔴 it refuses on EVERY on-air status, not just the two the section used to name', async () => {
    /*
      The section derived its own answer: `item?.status === 'on-air' || item?.status === 'playing'`.
      `isOnAirStatus` — which `removeIsRefused` reads, and which the BRIDGE refuses on — covers
      more than those two. Each of these was a row the operator could destroy through a dialog
      that told him it was safe.
    */
    for (const status of ['updating', 'unconfirmed', 'exiting'] as const) {
      stationSetupStub({ items: [item(status)], slots: boundSlots, bank: SETUP_BANK });
      const dialog = await renderStationSetup({ section: 'candidate-layers' });
      const button = removeButton(sectionOf(dialog, 'candidate-layers'));
      expect(button?.disabled, `${status} must be refused like every other on-air status`).toBe(
        true,
      );
      await unmountStationSetup();
      clearPortals();
    }
  });

  it('🔴 it consults the bridge’s PUBLISHED exemption, and does not re-derive around it', async () => {
    /*
      `B-228`'s lesson, third occurrence: `removeExempt` is the bridge's own answer, joined onto
      the item at the publication seam. An exempt row is one the bridge WOULD accept, so a
      renderer that recomputed the rule would sit disabled over a press that works — the exact
      UI↔wire disagreement that held `dev`'s Linux e2e red once already.
    */
    stationSetupStub({
      items: [item('on-air', { removeExempt: true } as Partial<StackItemState>)],
      slots: boundSlots,
      bank: SETUP_BANK,
    });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    expect(
      removeButton(sectionOf(dialog, 'candidate-layers'))?.disabled,
      'an EXEMPT on-air row is one the bridge accepts — refusing it is the same defect mirrored',
    ).toBe(false);
  });

  it('POSITIVE CONTROL: an idle row’s control is live, so this is not passing on a dead render', async () => {
    stationSetupStub({ items: [item('idle')], slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const button = removeButton(sectionOf(dialog, 'candidate-layers'));
    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('title')).not.toBe(REMOVE_ON_AIR_REASON);
  });
});

describe('B-238 §2 — after the press: a refusal that arrives is SHOWN', () => {
  it('🔴 a resolved refusal reaches the pinned region, in the refusal treatment, naming the row', async () => {
    /*
      The row is EXEMPT, so the control is live and the operator can genuinely press it — and
      the bridge refuses anyway. That is the race `errorCodeMessage`'s own note names, and it
      is the only honest way to exercise this half now that the on-air control is dead.

      ⚠ `stack.remove` RESOLVES this; it does not throw. A `try/catch` sees nothing.
    */
    const stub = stationSetupStub({
      items: [item('on-air', { removeExempt: true } as Partial<StackItemState>)],
      slots: boundSlots,
      bank: SETUP_BANK,
      removeResult: { accepted: false, errorCode: REMOVE_ON_AIR_CODE },
    });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });

    // Nothing is claimed before the press — §3, and without it this passes on a standing line.
    expect(dialog.querySelector('[data-modal-message]')).toBeNull();

    const button = removeButton(sectionOf(dialog, 'candidate-layers'));
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    // The confirm gate still stands for a row the renderer did not refuse.
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    const go = [...(confirm?.querySelectorAll('button') ?? [])].find((b) =>
      /^Remove/.test(b.textContent ?? ''),
    );
    await act(async () => {
      go?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(stub.remove).toHaveBeenCalledWith({ itemId: 'item-1' });

    const region = dialog.querySelector('[data-modal-message]');
    expect(
      region,
      'a refusal that renders nothing is a bug even when the refusal was right',
    ).not.toBeNull();
    // IDENTITY, not agreement: the sentence is the ONE the row's tooltip and the toast use.
    const mapped = errorCodeMessage(REMOVE_ON_AIR_CODE);
    expect(mapped, 'the code must map to a sentence').toBe(REMOVE_ON_AIR_REASON);
    expect(region?.textContent).toContain(REMOVE_ON_AIR_REASON);
    // …and in the REFUSAL treatment, not the neutral one. Appearing is the signal; the
    // colour is what says which kind of thing appeared.
    expect(region?.querySelector('[data-notice="refusal"]')).not.toBeNull();
    /*
      …and it names the ROW and the TEMPLATE in the operator's words, never the itemId
      (golden rule 11). `Layer 2` is this row's operator-facing name — the bank's second
      position — because this fixture's slot carries no alias; the point is that the sentence
      names the row the operator is looking at rather than `item-1`.
    */
    expect(region?.textContent).toContain('Layer 2');
    expect(region?.textContent).toContain('ساعت اذان');
    expect(region?.textContent).not.toContain('item-1');
  });

  it('an ACCEPTED remove says nothing false — no refusal is invented', async () => {
    // The negative control. Without it "a refusal appears" could be satisfied by a section
    // that reports one on every press.
    stationSetupStub({
      items: [item('idle')],
      slots: boundSlots,
      bank: SETUP_BANK,
      removeResult: { accepted: true },
    });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const button = removeButton(sectionOf(dialog, 'candidate-layers'));
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    const go = [...(confirm?.querySelectorAll('button') ?? [])].find((b) =>
      /^Remove/.test(b.textContent ?? ''),
    );
    await act(async () => {
      go?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(dialog.querySelector('[data-notice="refusal"]')).toBeNull();
  });
});

/**
 * 🔴 `B-239` — **AND MY FIRST FIX FOR IT WAS WRONG, WHICH IS WHY THIS BLOCK READS AS IT DOES.**
 *
 * The reported symptom was that a refusal had nowhere to appear because a standing sentence
 * occupied the message region. **It does not.** Measured against the running app, per tab:
 * `[data-modal-message]` is CONDITIONAL (`Modal.tsx`, `messages.length > 0`) and is ABSENT at
 * rest on four of five tabs — on Servers it holds a real, event-driven refusal. `footerRest`
 * is a SEPARATE node one row below it, always present.
 *
 * So the silence was never occupation: nothing was ever reported, because
 * `CandidateLayersSection` discarded `stack.remove`'s result and the refusal RESOLVES rather
 * than throwing. That is fixed above, and it closes B-238.
 *
 * ⭐ **The first spelling of this block asserted the footer sentence should be DELETED.** That
 * was asserting the wrong fix, and the failing test was the messenger rather than the verdict.
 * The sentence is the section's COMMIT CONTRACT, and it is pinned while the legend that
 * duplicates it scrolls away — so it stays. What was true, and is what this now pins, is that
 * it looked like a message: the same muted grey a notice's neighbour uses, restating the
 * legend fifteen lines above it, so it read as an event and was ignored as furniture.
 *
 * The distinction is proved by TREATMENT, not by text — because text is what a reader compares
 * and treatment is what an operator sees from across a gallery.
 */
describe('B-239 §3 — the contract is a LABEL; only an event looks like an event', () => {
  it('🔴 at rest: the contract is present, and the event region is ABSENT', async () => {
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });

    const foot = dialog.querySelector('[data-section-footer="candidate-layers"]');
    expect(foot?.textContent?.trim().length ?? 0, 'the commit contract stays').toBeGreaterThan(0);
    expect(
      dialog.querySelector('[data-modal-message]'),
      'nothing has happened, so nothing is reported',
    ).toBeNull();
  });

  it('🔴 the contract is marked as a LABEL, so it cannot be read as a notice', async () => {
    /*
      The one thing that was genuinely wrong. A label and an event were the same muted grey
      sentence in the same corner. This pins the label TREATMENT — the app's existing
      vocabulary for "this is chrome, not content", the same one `.cg-rail-group` and a table
      header wear (`.cg-card__title` wore it too until `RUNTIME-REDESIGN-01` Phase 7 took the
      card head to the reference's sentence-case rank; the footer contract is unchanged).
    */
    stationSetupStub({ slots: boundSlots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const foot = dialog.querySelector<HTMLElement>('[data-section-footer="candidate-layers"]');
    expect(foot?.getAttribute('data-footer-role'), 'it declares what it is').toBe('contract');
  });

  it('🔴 when a refusal arrives, the two are told apart by TREATMENT, not only by text', async () => {
    const stub = stationSetupStub({
      items: [item('on-air', { removeExempt: true } as Partial<StackItemState>)],
      slots: boundSlots,
      bank: SETUP_BANK,
      removeResult: { accepted: false, errorCode: REMOVE_ON_AIR_CODE },
    });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const button = removeButton(sectionOf(dialog, 'candidate-layers'));
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    const go = [...(confirm?.querySelectorAll('button') ?? [])].find((b) =>
      /^Remove/.test(b.textContent ?? ''),
    );
    await act(async () => {
      go?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(stub.remove).toHaveBeenCalled();

    // BOTH are on screen at once, and they are different KINDS of thing:
    const foot = dialog.querySelector<HTMLElement>('[data-section-footer="candidate-layers"]');
    const event = dialog.querySelector('[data-modal-message] [data-notice="refusal"]');
    expect(foot?.getAttribute('data-footer-role')).toBe('contract');
    expect(event, 'the event appeared').not.toBeNull();
    // …and the event is NOT inside the footer, which is the structural half of the distinction.
    expect(foot?.contains(event)).toBe(false);
  });

  it('the contract is STANDING: a refusal does not change it, it appears beside it', async () => {
    /*
      §3's sweep, restated correctly — and MEASURED rather than word-sniffed.

      The first spelling of this assertion forbade the words an event would use, and it failed
      on Servers' `Applied together. Refused while anything is on air.` — which is a STANDING
      CONDITION, not a report that something happened. That is the wrong instrument: whether a
      sentence is an event is not a property of its vocabulary.

      What actually distinguishes them is that one CHANGES and the other does not. So: the
      footer reads exactly its section's declared `footerRest` both before and after a refusal
      arrives, while the event region goes from absent to present.
    */
    stationSetupStub({
      items: [item('on-air', { removeExempt: true } as Partial<StackItemState>)],
      slots: boundSlots,
      bank: SETUP_BANK,
      removeResult: { accepted: false, errorCode: REMOVE_ON_AIR_CODE },
    });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const spec = STATION_SETUP_SECTIONS.find((s) => s.id === 'candidate-layers');
    expect(spec?.footerRest.length ?? 0, 'the contract exists to be asserted on').toBeGreaterThan(
      0,
    );
    const footText = (): string =>
      dialog.querySelector('[data-section-footer="candidate-layers"]')?.textContent?.trim() ?? '';

    expect(footText()).toBe(spec?.footerRest);
    expect(dialog.querySelector('[data-modal-message]')).toBeNull();

    const button = removeButton(sectionOf(dialog, 'candidate-layers'));
    await act(async () => {
      button?.click();
      await Promise.resolve();
    });
    const confirm = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].at(-1);
    const go = [...(confirm?.querySelectorAll('button') ?? [])].find((b) =>
      /^Remove/.test(b.textContent ?? ''),
    );
    await act(async () => {
      go?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(footText(), 'the contract did not become the message').toBe(spec?.footerRest);
    expect(
      dialog.querySelector('[data-modal-message]'),
      'the event appeared beside it',
    ).not.toBeNull();
  });

  it('and every section’s contract is a non-empty standing string', () => {
    for (const spec of STATION_SETUP_SECTIONS) {
      expect(spec.footerRest.length, `${spec.id} states its commit contract`).toBeGreaterThan(0);
    }
  });
});

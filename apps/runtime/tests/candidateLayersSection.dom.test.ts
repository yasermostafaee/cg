// @vitest-environment jsdom
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedSlotState } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_BANK,
  clickSetupButton,
  renderStationSetup,
  sectionOf,
  setupSlot,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * R-021 stage 2b / R-028 — the candidate-layer bank's configuration, a SECTION of Station
 * setup since `STATION-SETUP-02` (it was the `Configure` dialog):
 *
 *  - `channel`, `start` AND `count` are READ-ONLY facts (R-028: the ceiling is
 *    fixed at install — no input invites a click that only rejects);
 *  - each candidate layer carries a visibility tick + an alias input;
 *  - a refusal surfaces the mapped reason sentence AND the bridge's own
 *    `message` (which names the layer / both ranges) — in the dialog's pinned region;
 *  - an accepted change REPORTS and stays open (the bridge republishes itself; there is
 *    no dialog of this section's own to close) — the one behaviour the move changed;
 *  - R-028 (2.4) — an occupied row offers "Remove…" behind the row's own
 *    confirm gate, stating ON AIR explicitly when the item is.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** All open dialogs, outermost first — the confirm gate stacks a second one. */
function allDialogs(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
}

describe('Station setup — Candidate layers', () => {
  it('R-028 — channel, start AND count are read-only facts; the inputs are per-layer ticks + aliases', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const section = sectionOf(dialog, 'candidate-layers');
    expect(section.textContent).toContain('Channel 1');
    expect(section.textContent).toContain('layers 70–71');
    expect(section.textContent).toContain('fixed at install');
    // No count spinner — the ceiling never changes mid-session. Per layer: one visibility
    // checkbox and one alias field, for BOTH halves of the bank — the two operator rows
    // here plus the nine declared bed rows.
    const inputs = [...section.querySelectorAll('input')];
    expect(inputs.filter((i) => i.type === 'number')).toHaveLength(0);
    expect(inputs.filter((i) => i.type === 'checkbox')).toHaveLength(11);
    expect(inputs.filter((i) => i.type === 'text')).toHaveLength(11);
    // …and the bed group announces itself, or the operator has no way to see which
    // rows the load refusal is talking about.
    expect(section.textContent).toContain('Graphics beds');
  });

  it('a refused change surfaces the mapped reason AND the bridge message, in the pinned region, and stays open', async () => {
    const stub = stationSetupStub({
      fixedSetConfigResult: {
        ok: false,
        reason: 'untick-occupied',
        message: 'cannot hide layer 71: it is OCCUPIED (an item or producer is on it)',
      },
    });
    const onClose = vi.fn();
    const dialog = await renderStationSetup({ section: 'candidate-layers', onClose });

    await clickSetupButton(dialog, 'Apply candidate layers');

    expect(stub.fixedSetConfig).toHaveBeenCalledTimes(1);
    const refusal = dialog.querySelector('[data-modal-message] [role="alert"]');
    expect(refusal).not.toBeNull();
    // The SECTION, the RULE in operator wording (from the FIXED_LAYERS_SET_CONFIG_REASONS
    // map)… and the SPECIFICS, verbatim from the bridge.
    expect(refusal?.textContent).toContain('Candidate layers:');
    expect(refusal?.textContent).toContain('occupied');
    expect(refusal?.textContent).toContain('remove its template first');
    expect(refusal?.textContent).toContain('layer 71');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('an accepted change submits ticks + aliases with the UNCHANGED ceiling, reports, and does NOT close the dialog', async () => {
    const stub = stationSetupStub();
    const onClose = vi.fn();
    const dialog = await renderStationSetup({ section: 'candidate-layers', onClose });

    // Untick layer 71 — the only kind of live change R-028 allows besides aliases.
    const tick = dialog.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="Show layer 71"]',
    );
    await act(async () => {
      if (tick === null) throw new Error('no visibility tick for 71');
      tick.click();
      await Promise.resolve();
    });

    await clickSetupButton(dialog, 'Apply candidate layers');

    expect(stub.fixedSetConfig).toHaveBeenCalledTimes(1);
    expect(stub.fixedSetConfig).toHaveBeenCalledWith({
      channel: 1,
      low: { start: 1, count: 9 },
      start: 70,
      count: 2, // NEVER edited here — the ceiling is fixed at install
      aliases: { '70': 'CLOCK' },
      visibility: { '71': false },
    });
    // The move's one behavioural change: a section has no dialog of its own to close, so
    // an accepted apply SAYS so in the region and the dialog stays for the next section.
    expect(onClose).not.toHaveBeenCalled();
    expect(dialog.querySelector('[data-notice="notice"]')?.textContent).toContain(
      'Candidate layers applied',
    );
  });

  it('Revert puts the draft back without sending anything', async () => {
    const stub = stationSetupStub();
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const tick = dialog.querySelector<HTMLInputElement>(
      'input[type="checkbox"][aria-label="Show layer 71"]',
    );
    await act(async () => {
      tick?.click();
      await Promise.resolve();
    });
    expect(tick?.checked).toBe(false);
    await clickSetupButton(dialog, 'Revert');
    expect(tick?.checked).toBe(true);
    expect(stub.fixedSetConfig).not.toHaveBeenCalled();
  });

  it('with no bank, the section is the EXPLAINER — what the bridge needs, and no Apply', async () => {
    stationSetupStub({ bank: null, slots: [] });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const section = sectionOf(dialog, 'candidate-layers');
    expect(section.querySelector('[data-candidate-layers-unconfigured]')).not.toBeNull();
    expect(section.textContent).toContain('bridge-fixed-layers.json');
    expect(section.textContent).toContain('restart the bridge');
    expect(
      [...section.querySelectorAll('button')].map((b) => b.textContent),
      'nothing to apply, so nothing offers to',
    ).toEqual([]);
  });

  it('R-028 (2.4) — Remove… on an occupied row confirms, states ON AIR, and removal implies clear', async () => {
    const onAirItem: StackItemState = {
      itemId: 'item-1',
      templateId: 'tpl-1',
      fields: {},
      status: 'playing',
      pending: false,
    };
    const slots: FixedSlotState[] = [
      setupSlot(70, {
        itemId: 'item-1',
        templateType: 'clock',
        templateId: 'tpl-1',
        templateName: 'ساعت اذان',
      }),
      setupSlot(71),
    ];
    const stub = stationSetupStub({ items: [onAirItem], slots, bank: SETUP_BANK });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });

    // The occupied row names its template and offers the gate.
    const section = sectionOf(dialog, 'candidate-layers');
    expect(section.textContent).toContain('ساعت اذان');
    const removeButton = [...section.querySelectorAll('button')].find(
      (b) => b.textContent === 'Remove…',
    );
    expect(removeButton).toBeDefined();
    await act(async () => {
      removeButton?.click();
      await Promise.resolve();
    });

    // The confirm dialog is a SECOND portalled dialog, and it says ON AIR in words.
    const confirm = allDialogs().at(-1);
    expect(confirm?.textContent).toContain('ساعت اذان');
    expect(confirm?.textContent).toContain('ON AIR');
    expect(confirm?.textContent).toContain('CLEARS layer 70');

    // Nothing sent until confirmed…
    expect(stub.remove).not.toHaveBeenCalled();
    const act2 = [...(confirm?.querySelectorAll('button') ?? [])].find((b) =>
      b.textContent?.startsWith('Remove and clear'),
    );
    await act(async () => {
      act2?.click();
      await Promise.resolve();
    });
    // …then removal (which implies clear on the bridge) fires for the bound item.
    expect(stub.remove).toHaveBeenCalledTimes(1);
    expect(stub.remove).toHaveBeenCalledWith({ itemId: 'item-1' });
  });

  it('R-028 (2.4) — an item the stack cannot verify FAILS CLOSED: the dialog says MAY BE ON AIR, never "off air"', async () => {
    // The stack snapshot does NOT contain the bound item (stale/loading) — the destructive
    // dialog must not promise the graphic is off air.
    stationSetupStub({
      items: [],
      slots: [
        setupSlot(70, { itemId: 'item-ghost', templateType: 'clock', templateName: 'ساعت' }),
        setupSlot(71),
      ],
    });
    const dialog = await renderStationSetup({ section: 'candidate-layers' });
    const removeButton = [...sectionOf(dialog, 'candidate-layers').querySelectorAll('button')].find(
      (b) => b.textContent === 'Remove…',
    );
    await act(async () => {
      removeButton?.click();
      await Promise.resolve();
    });
    const confirm = allDialogs().at(-1);
    expect(confirm?.textContent).toContain('MAY BE ON AIR');
    expect(confirm?.textContent).toContain('CLEARS layer 70');
  });
});

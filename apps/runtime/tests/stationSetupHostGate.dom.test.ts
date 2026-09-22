// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  setSetupInput,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `MODAL-TRUTH-01` (owner, 2026-09-22) — **THE FIELD'S REFUSAL AND `Apply servers`' GATE
 * ARE ONE PREDICATE.** «همچین ip نباید بشه تایپ کرد!!»
 *
 * The owner typed `127.0.6110.121151515` into Primary host. Two things were wrong and they
 * are one defect: the value raised no refusal at all, and the BUTTON had never consulted the
 * rule that would have raised one — `parseEndpoint` asked only whether the host was
 * non-empty, so even a value the field DID refuse (a pasted URL) left `Apply servers` live.
 * A surface contradicting itself about the value in front of it is the session's subject.
 *
 * ⚠ These specs drive the real dialog and read the real button, deliberately: the rule
 * itself is unit-tested in `fieldValue.test.ts`, and a rule that is correct in isolation
 * while the button ignores it is exactly the state this fixes. The two halves are asserted
 * TOGETHER in every case below for that reason.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

function applyButton(el: HTMLElement): HTMLButtonElement {
  const btn = el.querySelector<HTMLButtonElement>('button[aria-label="Apply server settings"]');
  if (btn === null) throw new Error('Apply servers not rendered');
  return btn;
}

/** The one sentence this field is currently wrong by, as the operator reads it. */
function fieldError(el: HTMLElement, field: string): string {
  return el.querySelector(`[data-setup-field="${field}"] [data-field-error]`)?.textContent ?? '';
}

describe('MODAL-TRUTH-01 — an impossible address is refused, and cannot be applied', () => {
  it('🔴 the owner’s value: the field says why, and Apply is not available', async () => {
    stationSetupStub();
    const el = await renderStationSetup({ section: 'servers' });
    expect(applyButton(el).disabled).toBe(false);

    await setSetupInput(el, 'Primary host', '127.0.6110.121151515');

    expect(fieldError(el, 'Primary-host')).toContain('four parts');
    expect(applyButton(el).disabled).toBe(true);
  });

  it('typing a GOOD address raises nothing and leaves Apply available throughout', async () => {
    /*
      The refusal renders live, so every intermediate state of typing a correct IP is a state
      the operator is looking at. If any of them refused, he would learn to read past the
      sentence — and then not read the one that mattered.
    */
    stationSetupStub();
    const el = await renderStationSetup({ section: 'servers' });

    for (const partial of ['1', '19', '192', '192.', '192.168', '192.168.21', '192.168.21.11']) {
      await setSetupInput(el, 'Primary host', partial);
      expect(fieldError(el, 'Primary-host'), partial).toBe('');
      expect(applyButton(el).disabled, partial).toBe(false);
    }
    await setSetupInput(el, 'Primary host', '192.168.21.114');
    expect(fieldError(el, 'Primary-host')).toBe('');
    expect(applyButton(el).disabled).toBe(false);
  });

  it('a NAMED server is untouched — the rule never infers “host = IP”', async () => {
    stationSetupStub();
    const el = await renderStationSetup({ section: 'servers' });

    await setSetupInput(el, 'Primary host', 'caspar-a.local');
    expect(fieldError(el, 'Primary-host')).toBe('');
    expect(applyButton(el).disabled).toBe(false);
  });

  it('the gate was ALREADY split for a pasted URL — the field refused it and Apply stayed live', async () => {
    /*
      This case needed no new RULE: `hostError` has refused a URL since `SETTINGS-MATCH-02`.
      What it needed is the button to read it. Pinned separately so the fix cannot be
      narrowed back to "the IP rule" by someone who reads the commit and not the defect.
    */
    stationSetupStub();
    const el = await renderStationSetup({ section: 'servers' });

    await setSetupInput(el, 'Primary host', 'http://192.168.21.114/x');
    expect(fieldError(el, 'Primary-host')).toContain('not a URL');
    expect(applyButton(el).disabled).toBe(true);
  });

  it('the SERVE host goes through the same door, and blank still derives', async () => {
    stationSetupStub();
    const el = await renderStationSetup({ section: 'servers' });

    await setSetupInput(el, 'Template serve host', '10.0.999.1');
    expect(fieldError(el, 'serve-host')).toContain('four parts');
    expect(applyButton(el).disabled).toBe(true);

    // Blank is a real state on this one field and means "derive it" (`C-024`).
    await setSetupInput(el, 'Template serve host', '');
    expect(fieldError(el, 'serve-host')).toBe('');
    expect(applyButton(el).disabled).toBe(false);
  });
});

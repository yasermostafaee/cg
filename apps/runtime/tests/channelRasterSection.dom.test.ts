// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearPortals } from './support/dialog.js';
import {
  SETUP_RASTER,
  clickSetupButton,
  renderStationSetup,
  sectionOf,
  setSetupInput,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * `R-030` / `STATION-SETUP-02` §5 — **the channel raster's first UI.**
 *
 * `channelSettings.set` existed on the bridge with zero renderer call sites. The section
 * sends what was typed and shows what came back; every guard is the bridge's, surfaced in
 * the dialog's pinned region and never re-derived here. Configured and OBSERVED sit side by
 * side, and the verdict is the one canonical `rasterVerdict`.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

describe('Station setup — Channel raster', () => {
  it('lists each declared channel with its configured raster, what the server reports, and the verdict', async () => {
    stationSetupStub();
    const dialog = await renderStationSetup({ section: 'raster' });
    const section = sectionOf(dialog, 'raster');
    expect(section.querySelector('[data-raster-channel="1"]')?.textContent).toBe('Channel 1');
    expect(
      section.querySelector<HTMLInputElement>('input[aria-label="Channel 1 raster width"]')?.value,
    ).toBe('1920');
    expect(
      section.querySelector<HTMLInputElement>('input[aria-label="Channel 1 raster height"]')?.value,
    ).toBe('1080');
    expect(section.textContent).toContain('Server reports 1080p5000 (1920×1080)');
    expect(
      section.querySelector('[data-raster-verdict]')?.getAttribute('data-raster-verdict'),
    ).toBe('match');
  });

  it('a MISMATCH is said in the section, from the canonical verdict', async () => {
    stationSetupStub({
      raster: {
        settings: [{ channel: 1, raster: { width: 1920, height: 1080 } }],
        observed: [{ channel: 1, mode: '720p5000', raster: { width: 1280, height: 720 } }],
      },
    });
    const dialog = await renderStationSetup({ section: 'raster' });
    const verdict = sectionOf(dialog, 'raster').querySelector('[data-raster-verdict]');
    expect(verdict?.getAttribute('data-raster-verdict')).toBe('mismatch');
    expect(verdict?.textContent).toContain('MISMATCH');
  });

  it('an unreadable mode is a GAP, never a pass', async () => {
    stationSetupStub({
      raster: {
        settings: [{ channel: 1, raster: { width: 1920, height: 1080 } }],
        observed: [{ channel: 1, mode: 'weird9000', raster: null }],
      },
    });
    const dialog = await renderStationSetup({ section: 'raster' });
    const section = sectionOf(dialog, 'raster');
    expect(
      section.querySelector('[data-raster-verdict]')?.getAttribute('data-raster-verdict'),
    ).toBe('unreadable');
    expect(section.textContent).toContain('a mode this build cannot map');
  });

  it('Set raster sends the typed raster to the bridge — and ONLY the bridge writes it', async () => {
    const stub = stationSetupStub();
    const dialog = await renderStationSetup({ section: 'raster' });
    await setSetupInput(dialog, 'Channel 1 raster width', '1280');
    await setSetupInput(dialog, 'Channel 1 raster height', '720');
    await clickSetupButton(dialog, 'Set raster');
    expect(stub.rasterSet).toHaveBeenCalledTimes(1);
    expect(stub.rasterSet).toHaveBeenCalledWith({
      channel: 1,
      raster: { width: 1280, height: 720 },
    });
    const notice = dialog.querySelector('[data-modal-message] [data-notice="notice"]');
    expect(notice?.textContent).toContain('Channel raster: Channel 1 raster set to 1280×720');
    // No second writer: nothing else on the bridge was touched.
    expect(stub.setConfig).not.toHaveBeenCalled();
    expect(stub.fixedSetConfig).not.toHaveBeenCalled();
  });

  it('the bridge’s on-air refusal reaches the pinned region, with the rule AND the bridge’s count', async () => {
    const stub = stationSetupStub({
      rasterSetResult: {
        ok: false,
        reason: 'on-air-block',
        message:
          '2 item(s) are on air or unsettled — changing the channel raster re-scales every graphic on the channel, so it cannot be applied while anything is live. Take them off air first.',
      },
    });
    const dialog = await renderStationSetup({ section: 'raster' });
    await clickSetupButton(dialog, 'Set raster');
    expect(stub.rasterSet).toHaveBeenCalledTimes(1);
    const refusal = dialog.querySelector('[data-modal-message] [data-notice="refusal"]');
    expect(refusal).not.toBeNull();
    expect(refusal?.textContent).toContain('Channel raster:');
    expect(refusal?.textContent).toContain('cannot change while anything is on air');
    expect(refusal?.textContent).toContain('2 item(s) are on air or unsettled');
    // The dialog stays open; the draft stays.
    expect(
      sectionOf(dialog, 'raster').querySelector<HTMLInputElement>(
        'input[aria-label="Channel 1 raster width"]',
      )?.value,
    ).toBe('1920');
  });

  it('an unknown-channel refusal is worded, not a code', async () => {
    stationSetupStub({
      rasterSetResult: {
        ok: false,
        reason: 'unknown-channel',
        message: 'Channel 1 is not declared by this install (declared: none).',
      },
    });
    const dialog = await renderStationSetup({ section: 'raster' });
    await clickSetupButton(dialog, 'Set raster');
    const refusal = dialog.querySelector('[data-modal-message] [data-notice="refusal"]');
    expect(refusal?.textContent).toContain('not one this install declares');
    expect(refusal?.textContent).not.toContain('unknown-channel');
  });

  it('a raster that is not two whole positive numbers is refused locally, before the wire', async () => {
    const stub = stationSetupStub();
    const dialog = await renderStationSetup({ section: 'raster' });
    await setSetupInput(dialog, 'Channel 1 raster width', '0');
    await clickSetupButton(dialog, 'Set raster');
    expect(stub.rasterSet).not.toHaveBeenCalled();
    expect(
      dialog.querySelector('[data-modal-message] [data-notice="refusal"]')?.textContent,
    ).toContain('two whole numbers of pixels');
  });

  it('with no declared channel there is nothing to set, and the section says so', async () => {
    stationSetupStub({ raster: { settings: [], observed: [] } });
    const dialog = await renderStationSetup({ section: 'raster' });
    const section = sectionOf(dialog, 'raster');
    expect(section.querySelector('[data-raster-table]')).toBeNull();
    expect(section.textContent).toContain('No channel is declared yet');
    expect(SETUP_RASTER.settings.length, 'the default fixture really declares one').toBe(1);
  });
});

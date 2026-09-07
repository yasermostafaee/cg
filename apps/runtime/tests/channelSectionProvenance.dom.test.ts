// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import type { ChannelSettingsState } from '@cg/shared-ipc';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * `B-236` — **the Channel tab's "Declared by" line must not attribute the value to the
 * server unless the server actually supplied it.**
 *
 * The tab shows the STORED raster and, beside it, where that number came from. The earlier
 * spelling answered _"casparcg.config, read back from the server"_ whenever ANY observation
 * existed for the channel — which is a false attribution in the two cases the surface exists
 * to expose. On a `mismatch` the number on screen is the stored one and the server has just
 * contradicted it; on `unreadable` the reading carries no raster for it to have come from.
 * An operator reading "read back from the server" beside a number the server disagrees with
 * has been told the opposite of the fact the row is there to give him.
 *
 * ⚠ These assert the SENTENCE the operator reads, not that a `<dd>` exists — a presence
 * assertion passes on every one of the wrong answers above.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const CONFIGURED_1080 = { channel: 1, raster: { width: 1920, height: 1080 } };

/** The `Declared by` value as rendered, for the one declared channel. */
async function declaredByText(raster: ChannelSettingsState): Promise<string> {
  stationSetupStub({ raster });
  const dialog = await renderStationSetup({ section: 'channel' });
  const row = dialog.querySelector('[data-raster-channel="1"]');
  if (row === null) throw new Error('the Channel tab rendered no row for channel 1');
  const terms = [...row.querySelectorAll('dt')];
  const index = terms.findIndex((dt) => dt.textContent === 'Declared by');
  if (index < 0) throw new Error('no "Declared by" term on the row');
  return row.querySelectorAll('dd')[index]?.textContent ?? '';
}

it('names the SERVER only when the check agrees', async () => {
  const text = await declaredByText({
    settings: [CONFIGURED_1080],
    observed: [{ channel: 1, mode: '1080p5000', raster: { width: 1920, height: 1080 } }],
  });
  expect(text).toContain('read back from the server');
});

it('does NOT claim the server for a value the server CONTRADICTS', async () => {
  const text = await declaredByText({
    settings: [CONFIGURED_1080],
    observed: [{ channel: 1, mode: '720p5000', raster: { width: 1280, height: 720 } }],
  });
  // The stored number is on screen; the server said something else. Saying it was "read
  // back from the server" would make the mismatch below it read as a console fault.
  expect(text).not.toContain('read back from the server');
  expect(text).toContain('stored channel settings');
  expect(text).toContain('different raster');
});

it('distinguishes an UNMAPPED mode from a mode never read — both stored, different reasons', async () => {
  const unmapped = await declaredByText({
    settings: [CONFIGURED_1080],
    observed: [{ channel: 1, mode: 'holographic', raster: null }],
  });
  expect(unmapped).not.toContain('read back from the server');
  expect(unmapped).toContain('could not be mapped');

  await unmountStationSetup();
  clearPortals();

  const unread = await declaredByText({ settings: [CONFIGURED_1080], observed: [] });
  expect(unread).not.toContain('read back from the server');
  expect(unread).toContain('has not been read');
});

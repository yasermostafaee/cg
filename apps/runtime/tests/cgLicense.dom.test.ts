// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CG_UNLICENSED_CODE,
  cgOutsideCapReason,
  type LicenseState,
  type PlayoutLicense,
  type StationChannels,
} from '@cg/shared-ipc';
import { ChannelStrip } from '../src/renderer/features/channels/ChannelStrip.js';
import { __resetChannelChoiceForTest } from '../src/renderer/features/channels/channelStore.js';
import {
  LicenseGraceBanner,
  localDateTime,
} from '../src/renderer/features/status/BridgeSessionBanner.js';
import { takeRefusalLine } from '../src/renderer/features/layers/takeRefusalLine.js';
import type { AuthSessionState } from '../src/shared/runtime-bridge.js';
import { signedInStub } from './support/authStub.js';
import { stationSetupStub } from './support/stationSetup.js';

/**
 * 🔴 `PLAYOUT-FEATURES-01` D (`R-077`) — **THE CONSOLE SHOWS THE CG LICENSE'S STATE**: a channel where CG
 * is not licensed is marked on the strip with the reason on hover (the ONE predicate the bridge's take
 * refusal asks); the Playout's grace is said once, to a station admin only; and a take refused for the
 * license carries the Playout's own message on its row.
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
  __resetChannelChoiceForTest();
  vi.restoreAllMocks();
});

const BANK_ON_TWO = { channel: 2, low: { start: 50, count: 9 }, start: 70, count: 4 };
const RASTER_ON_TWO = {
  settings: [{ channel: 2, raster: { width: 1920, height: 1080 } }],
  observed: [],
};
const OPERATOR = signedInStub('Sara', [2]);
const ADMIN = signedInStub('Mina', [2], ['station-admin', 'operator', 'viewer']);
const LICENSED: PlayoutLicense = { licensed: true, playoutState: 'valid' };

function discovered(cgLicensed: boolean | undefined): StationChannels {
  return {
    channels: [
      {
        channel: 2,
        named: null,
        declared: true,
        permitted: true,
        ...(cgLicensed === undefined ? {} : { cgLicensed }),
        sources: ['catalogue', 'bank'],
      },
    ],
  };
}

async function mount(
  element: Parameters<typeof createElement>[0],
  opts: {
    readonly license: PlayoutLicense | null;
    readonly channels?: StationChannels;
    readonly auth?: AuthSessionState;
  },
): Promise<HTMLElement> {
  stationSetupStub({ bank: BANK_ON_TWO, raster: RASTER_ON_TWO, auth: opts.auth ?? OPERATOR });
  const cg = (
    window as unknown as {
      cg: Record<string, unknown>;
    }
  ).cg;
  cg['stationChannels'] = {
    list: () => Promise.resolve(opts.channels ?? discovered(undefined)),
    onChanged: () => () => undefined,
  };
  cg['license'] = {
    state: (): Promise<LicenseState> => Promise.resolve({ license: opts.license }),
    onChanged: () => () => undefined,
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(element, null)));
  });
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
  return container;
}

const tab = (el: HTMLElement): HTMLButtonElement | null =>
  el.querySelector<HTMLButtonElement>('[role="tablist"][aria-label="Channels"] [role="tab"]');

describe('PLAYOUT-FEATURES-01 D — the strip marks a channel where CG is not licensed', () => {
  it('🔴 D4 `cgLicensed: false` → the label says NO CG LICENSE and the title carries the reason', async () => {
    const el = await mount(ChannelStrip, { license: LICENSED, channels: discovered(false) });
    expect(tab(el)?.textContent).toBe('CHANNEL 2 · NO CG LICENSE');
    expect(tab(el)?.title).toBe(`Channel 2 · ${cgOutsideCapReason(2)}`);
  });

  it('`licensed: false` marks the channel with the Playout’s own message', async () => {
    const message = 'لایسنسِ این Playout شاملِ CG Control نیست.';
    const el = await mount(ChannelStrip, {
      license: { licensed: false, reason: 'not_included', message },
      channels: discovered(undefined),
    });
    expect(tab(el)?.textContent).toContain('NO CG LICENSE');
    expect(tab(el)?.title).toBe(`Channel 2 · ${message}`);
  });

  it('CONTROL — `cgLicensed: true`, and a license never read: no mark, no reason', async () => {
    let el = await mount(ChannelStrip, { license: LICENSED, channels: discovered(true) });
    expect(tab(el)?.textContent).toBe('CHANNEL 2');
    expect(tab(el)?.title).toBe('');
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    el = await mount(ChannelStrip, { license: null, channels: discovered(undefined) });
    expect(tab(el)?.textContent).toBe('CHANNEL 2');
  });
});

describe('PLAYOUT-FEATURES-01 D — the Playout’s grace, said once to an admin', () => {
  const GRACE: PlayoutLicense = {
    licensed: true,
    playoutState: 'grace',
    graceUntil: '2026-10-01T12:00:00Z',
  };
  const banner = (): HTMLElement | null => document.querySelector('[data-license-grace-banner]');

  it('🔴 an admin sees ONE line naming `graceUntil`', async () => {
    await mount(LicenseGraceBanner, { license: GRACE, auth: ADMIN });
    expect(banner()?.textContent).toBe(
      `Playout license expired — grace until ${localDateTime('2026-10-01T12:00:00Z')}`,
    );
  });

  it('an operator sees none — CONTROL: an admin outside grace sees none either', async () => {
    await mount(LicenseGraceBanner, { license: GRACE, auth: OPERATOR });
    expect(banner()).toBeNull();
    await act(async () => {
      root?.unmount();
    });
    root = null;
    container?.remove();
    await mount(LicenseGraceBanner, { license: LICENSED, auth: ADMIN });
    expect(banner()).toBeNull();
  });
});

describe('PLAYOUT-FEATURES-01 D — the row’s refusal line', () => {
  it('🔴 a take refused for the license says the Playout’s own message after the row', () => {
    const message = 'لایسنسِ این Playout شاملِ CG Control نیست.';
    const line = takeRefusalLine('Row 80', { code: CG_UNLICENSED_CODE, message });
    expect(line.text).toBe(`Row 80: ${message}`);
    expect(line.playoutWords).toBe(message);
  });
});

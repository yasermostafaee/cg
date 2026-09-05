// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelOutputCheck, ServerHealth } from '@cg/shared-ipc';
import {
  OutputMissingBanner,
  OutputMissingStrip,
} from '../src/renderer/features/status/OutputMissingBanner.js';

/**
 * `C-029` — the program-output banner, driven by the plant's own fixture (2026-09-04):
 * `casparcg.config` declares `<decklink><device>23487013</device>`, the consumer failed at
 * boot, and `INFO 1` reports only `system-audio` and `screen`. The banner is judged on
 * what an OPERATOR can act on from its words — the channel, the declared thing that is not
 * running, and where the fix is — and, as much, on what must NOT light: an ok verdict, an
 * unreadable declaration, a server nobody has checked yet.
 *
 * `B-223` (2026-09-05) — severity by air-criticality, and one line for the operator. Two
 * red-first classes: a missing DeckLink still alarms exactly as before; a missing `screen` or
 * `system-audio` raises NOTHING on this surface. And the banner no longer carries the
 * engineering detail (addressing form, the log recipe, the restart paragraph, the creation
 * outcome) — those live in `OutputsSection` and are pinned in `outputsSection.dom.test.ts`.
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
});

async function renderStrip(server: ServerHealth): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(OutputMissingStrip, { server }));
  });
  return container;
}

async function renderBanner(
  link: 'live' | 'disconnected' | 'offline-mock',
  primary: ServerHealth,
): Promise<HTMLElement> {
  const health = { primary, currentPrimary: 'A', strategy: 'mirror-sync' };
  const stub = {
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    connections: {
      health: () => Promise.resolve(health),
      onHealthChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(OutputMissingBanner, {}));
  });
  await act(async () => {
    await Promise.resolve();
  });
  return container;
}

const alertEl = (el: HTMLElement): HTMLElement | null => el.querySelector('[role="alert"]');

const MISSING: ChannelOutputCheck = {
  channel: 1,
  declared: [
    { kind: 'decklink', device: '23487013', embeddedAudio: true, keyer: 'default' },
    { kind: 'screen' },
    { kind: 'system-audio' },
  ],
  running: [
    { port: 500, kind: 'system-audio' },
    { port: 600, kind: 'screen' },
  ],
  missing: [{ kind: 'decklink', declared: 1, running: 0, devices: ['23487013'] }],
  observedAt: '2026-09-04T20:00:00.000Z',
};

const OK: ChannelOutputCheck = {
  ...MISSING,
  running: [...MISSING.running, { port: 23487313, kind: 'decklink' }],
  missing: [],
};

/** `B-223` — the plant on 2026-09-05: the screen consumer stopped, the DeckLink running. */
const SCREEN_ONLY: ChannelOutputCheck = {
  ...OK,
  running: [
    { port: 23487313, kind: 'decklink' },
    { port: 500, kind: 'system-audio' },
  ],
  missing: [{ kind: 'screen', declared: 1, running: 0, devices: [] }],
  observedAt: '2026-09-05T14:08:44.000Z',
};

const server = (state: ServerHealth['state'], outputs?: ChannelOutputCheck[]): ServerHealth => ({
  label: 'A',
  state,
  amcpAxisOk: state === 'healthy',
  ...(outputs !== undefined ? { outputs } : {}),
});

describe('C-029 — the banner on the plant’s fixture', () => {
  it('names the channel, the declared consumer by device, and where the fix is', async () => {
    const el = await renderStrip(server('healthy', [MISSING]));
    const banner = alertEl(el);
    expect(banner?.getAttribute('aria-label')).toBe('Program output missing');
    const text = banner?.textContent ?? '';
    expect(text).toContain('PROGRAM OUTPUT MISSING');
    expect(text).toContain('CHANNEL 1 HAS NO DECKLINK OUTPUT');
    expect(text).toContain('NOTHING ON THIS CHANNEL REACHES AIR');
    expect(text).toContain('decklink (device 23487013)');
    expect(text).toContain('CasparCG is not running it');
    expect(text).toContain('The fix is on the playout machine');
    expect(text).toContain('Server connection ▸ Outputs');
  });

  it('is a strip like ConnectionBanner’s, not a fixed slab', async () => {
    const banner = alertEl(await renderStrip(server('healthy', [MISSING])));
    expect(banner?.style.position).toBe('');
    expect(banner?.style.height).toBe('');
    expect(banner?.style.flexShrink).toBe('0');
  });

  it('🔴 degraded is reachable — the alarm shows there exactly as on healthy', async () => {
    expect(alertEl(await renderStrip(server('degraded', [MISSING])))).not.toBeNull();
  });
});

describe('B-223 — the operator gets ONE line; the engineering detail is not on this surface', () => {
  it('🔴 the banner carries the headline and one line per channel, nothing else', async () => {
    const banner = alertEl(await renderStrip(server('healthy', [MISSING])));
    // The headline plus exactly one detail line for the one channel.
    expect(banner?.querySelectorAll('span span').length).toBe(1);
    const text = banner?.textContent ?? '';
    expect(text).not.toMatch(/persistent ID/);
    expect(text).not.toMatch(/slot index/);
    expect(text).not.toMatch(/Decklink devices found/);
    expect(text).not.toMatch(/restart CasparCG/);
    expect(text).not.toMatch(/power-cycle/);
    expect(text).not.toMatch(/CasparCG log/);
  });

  it('🔴 the creation outcome is engineering detail and stays off the banner', async () => {
    const check: ChannelOutputCheck = {
      ...MISSING,
      creation: {
        at: '2026-09-04T20:00:05.000Z',
        outcome: 'refused',
        command: 'ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO',
        code: 403,
      },
    };
    const text = alertEl(await renderStrip(server('healthy', [check])))?.textContent ?? '';
    expect(text).not.toContain('ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO');
    expect(text).not.toMatch(/refused/);
  });
});

describe('B-223 — a local monitor never reaches the operator', () => {
  it('🔴 a missing screen consumer renders NO banner — a preview window is not air', async () => {
    expect(alertEl(await renderStrip(server('healthy', [SCREEN_ONLY])))).toBeNull();
  });

  it('🔴 a missing system-audio consumer renders no banner either', async () => {
    const check: ChannelOutputCheck = {
      ...SCREEN_ONLY,
      running: [
        { port: 23487313, kind: 'decklink' },
        { port: 600, kind: 'screen' },
      ],
      missing: [{ kind: 'system-audio', declared: 1, running: 0, devices: [] }],
    };
    expect(alertEl(await renderStrip(server('healthy', [check])))).toBeNull();
  });

  it('both local monitors missing at once is still nothing', async () => {
    const check: ChannelOutputCheck = {
      ...SCREEN_ONLY,
      running: [{ port: 23487313, kind: 'decklink' }],
      missing: [
        { kind: 'screen', declared: 1, running: 0, devices: [] },
        { kind: 'system-audio', declared: 1, running: 0, devices: [] },
      ],
    };
    expect(alertEl(await renderStrip(server('healthy', [check])))).toBeNull();
  });

  it('a kept local-only verdict on an unreachable server is nothing too', async () => {
    expect(alertEl(await renderStrip(server('disconnected', [SCREEN_ONLY])))).toBeNull();
  });

  it('a DeckLink missing beside a missing screen alarms for the DeckLink, and names only it', async () => {
    const check: ChannelOutputCheck = {
      ...MISSING,
      running: [{ port: 500, kind: 'system-audio' }],
      missing: [...MISSING.missing, { kind: 'screen', declared: 1, running: 0, devices: [] }],
    };
    const text = alertEl(await renderStrip(server('healthy', [check])))?.textContent ?? '';
    expect(text).toContain('CHANNEL 1 HAS NO DECKLINK OUTPUT');
    expect(text).toContain('decklink (device 23487013)');
    expect(text).not.toMatch(/screen/);
  });

  it('🔴 an unknown consumer kind is treated as a program output — loud, never silent', async () => {
    const check: ChannelOutputCheck = {
      ...OK,
      declared: [...(OK.declared ?? []), { kind: 'some-future-consumer' }],
      missing: [{ kind: 'some-future-consumer', declared: 1, running: 0, devices: [] }],
    };
    const text = alertEl(await renderStrip(server('healthy', [check])))?.textContent ?? '';
    expect(text).toContain('HAS NO SOME-FUTURE-CONSUMER OUTPUT');
  });
});

describe('C-029 — what must NOT light', () => {
  it('every declared consumer running → nothing', async () => {
    expect(alertEl(await renderStrip(server('healthy', [OK])))).toBeNull();
  });

  it('no check yet → nothing, whatever the state', async () => {
    expect(alertEl(await renderStrip(server('healthy')))).toBeNull();
    expect(alertEl(await renderStrip(server('disconnected')))).toBeNull();
  });

  it('an unreadable declaration is a gap in the check, not an alarm', async () => {
    expect(
      alertEl(await renderStrip(server('healthy', [{ ...OK, declared: null, missing: [] }]))),
    ).toBeNull();
  });

  it('unreachable after an OK verdict → nothing: the connection surfaces own that fault', async () => {
    expect(alertEl(await renderStrip(server('disconnected', [OK])))).toBeNull();
  });
});

describe('C-029 — when the bridge cannot reach CasparCG', () => {
  it('🔴 a missing verdict does not go quiet: it re-labels as UNVERIFIED and says why it stays', async () => {
    const el = await renderStrip(server('disconnected', [MISSING]));
    const banner = alertEl(el);
    expect(banner?.getAttribute('aria-label')).toBe('Program output unverified');
    const text = banner?.textContent ?? '';
    expect(text).toContain('PROGRAM OUTPUT UNVERIFIED');
    expect(text).toContain('SERVER A IS UNREACHABLE');
    expect(text).toContain('WITHOUT ITS DECKLINK OUTPUT');
    expect(text).toMatch(/stays until the bridge can reach CasparCG/);
    expect(text).toContain('Server connection ▸ Outputs');
  });
});

describe('C-029 — through the hooks', () => {
  it('renders from connection health on a live link', async () => {
    const el = await renderBanner('live', server('healthy', [MISSING]));
    expect(alertEl(el)?.getAttribute('aria-label')).toBe('Program output missing');
  });

  it('renders nothing while the browser→bridge link is down: ConnectionBanner is the alarm there', async () => {
    expect(alertEl(await renderBanner('disconnected', server('healthy', [MISSING])))).toBeNull();
    expect(alertEl(await renderBanner('offline-mock', server('healthy', [MISSING])))).toBeNull();
  });
});

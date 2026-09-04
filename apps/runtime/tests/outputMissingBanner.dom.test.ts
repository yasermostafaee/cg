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
 * running, what IS running, and the next action — and, as much, on what must NOT light:
 * an ok verdict, an unreadable declaration, a server nobody has checked yet.
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

const server = (state: ServerHealth['state'], outputs?: ChannelOutputCheck[]): ServerHealth => ({
  label: 'A',
  state,
  amcpAxisOk: state === 'healthy',
  ...(outputs !== undefined ? { outputs } : {}),
});

describe('C-029 — the banner on the plant’s fixture', () => {
  it('names the channel, the declared consumer by device, what IS running, and the next action', async () => {
    const el = await renderStrip(server('healthy', [MISSING]));
    const banner = alertEl(el);
    expect(banner?.getAttribute('aria-label')).toBe('Program output missing');
    const text = banner?.textContent ?? '';
    expect(text).toContain('PROGRAM OUTPUT MISSING');
    expect(text).toContain('CHANNEL 1 HAS NO DECKLINK OUTPUT');
    expect(text).toContain('NOTHING ON THIS CHANNEL REACHES AIR');
    expect(text).toContain('decklink (device 23487013)');
    expect(text).toContain('Running: system-audio, screen');
    expect(text).toContain('restart CasparCG');
    expect(text).toMatch(/CasparCG log/);
    // The server is UP — nobody power-cycles a working playout box over this.
    expect(text).toMatch(/do not power-cycle/);
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
    expect(text).toContain('decklink (device 23487013)');
    expect(text).toMatch(/stays until the bridge can reach CasparCG/);
  });
});

describe('C-029 — a monitor-only loss is said in a softer voice', () => {
  it('a missing screen does not claim nothing reaches air', async () => {
    const check: ChannelOutputCheck = {
      ...OK,
      running: [
        { port: 23487313, kind: 'decklink' },
        { port: 500, kind: 'system-audio' },
      ],
      missing: [{ kind: 'screen', declared: 1, running: 0, devices: [] }],
    };
    const banner = alertEl(await renderStrip(server('healthy', [check])));
    const text = banner?.textContent ?? '';
    expect(text).toContain('DECLARED OUTPUT NOT RUNNING');
    expect(text).not.toContain('NOTHING ON THIS CHANNEL REACHES AIR');
    expect(text).toContain('screen');
  });
});

describe('C-029 — the creation flag’s outcome is reported in the operator’s words', () => {
  it('a refused ADD says CasparCG could not open the device either', async () => {
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
    expect(text).toContain('ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO');
    expect(text).toMatch(/refused \(403\)/);
    expect(text).toMatch(/cannot open that device either/);
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

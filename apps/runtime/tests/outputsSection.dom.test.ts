// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelOutputCheck, ConnectionHealth, ServerHealth } from '@cg/shared-ipc';
import { OutputsSection } from '../src/renderer/features/connections/OutputsSection.js';

/**
 * `B-223` — the TECHNICAL surface of the output check: the Server connection dialog's
 * Outputs section. Everything that used to be on the operator banner and is engineering —
 * `C-030`'s addressing reading and log recipe, `C-029`'s failed-at-start paragraph and the
 * creation outcome — is pinned HERE now, with the same assertions the banner tests carried
 * (`outputMissingBanner.addressing.dom.test.ts` was folded in; not one assertion was dropped).
 *
 * Red-first: written against the tree before the section existed; every case failed on
 * "module not found", then the section was written.
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

async function render(health: ConnectionHealth | null): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(OutputsSection, { health }));
  });
  const section = container.querySelector<HTMLElement>('section[aria-label="Program outputs"]');
  if (section === null) throw new Error('the outputs section did not render');
  return section;
}

function missingDevice(device: string): ChannelOutputCheck {
  return {
    channel: 1,
    declared: [
      { kind: 'decklink', device, embeddedAudio: true, keyer: 'default' },
      { kind: 'screen' },
      { kind: 'system-audio' },
    ],
    running: [
      { port: 500, kind: 'system-audio' },
      { port: 600, kind: 'screen' },
    ],
    missing: [{ kind: 'decklink', declared: 1, running: 0, devices: [device] }],
    observedAt: '2026-09-04T20:00:00.000Z',
  };
}

/** The plant on 2026-09-05: the screen consumer stopped, the DeckLink running. */
const SCREEN_ONLY: ChannelOutputCheck = {
  channel: 1,
  declared: [
    { kind: 'decklink', device: '23487013' },
    { kind: 'screen' },
    { kind: 'system-audio' },
  ],
  running: [
    { port: 23487313, kind: 'decklink' },
    { port: 500, kind: 'system-audio' },
  ],
  missing: [{ kind: 'screen', declared: 1, running: 0, devices: [] }],
  observedAt: '2026-09-05T14:08:44.000Z',
};

const serverA = (state: ServerHealth['state'], outputs?: ChannelOutputCheck[]): ServerHealth => ({
  label: 'A',
  state,
  amcpAxisOk: state === 'healthy',
  ...(outputs !== undefined ? { outputs } : {}),
});

const health = (primary: ServerHealth, backup?: ServerHealth): ConnectionHealth =>
  ({
    primary,
    ...(backup !== undefined ? { backup } : {}),
    currentPrimary: 'A',
    strategy: 'mirror-sync',
  }) as ConnectionHealth;

describe('B-223 — an AIR loss carries the full remedy here', () => {
  it('🔴 a missing DeckLink is an AIR row with the declared device, what runs, and the restart paragraph', async () => {
    const el = await render(health(serverA('healthy', [missingDevice('23487013')])));
    const air = el.querySelector('[data-severity="air"]');
    expect(air?.textContent).toContain('decklink (device 23487013)');
    const text = el.textContent ?? '';
    expect(text).toContain('Declared: decklink, screen, system-audio');
    expect(text).toContain('Running: system-audio, screen');
    expect(text).toContain('Nothing on this channel reaches air');
    expect(text).toMatch(/restart CasparCG/);
    expect(text).toMatch(/CasparCG log/);
    // The server is UP — nobody power-cycles a working playout box over this.
    expect(text).toMatch(/do not power-cycle/);
  });

  it('C-030 — the plant’s declaration is called a hardware persistent ID, in plain words', async () => {
    const text =
      (await render(health(serverA('healthy', [missingDevice('23487013')])))).textContent ?? '';
    expect(text).toContain('hardware persistent ID 23487013');
    expect(text).not.toContain('slot index 23487013');
  });

  it('C-030 — a small number is called a slot index', async () => {
    const text = (await render(health(serverA('healthy', [missingDevice('1')])))).textContent ?? '';
    expect(text).toContain('slot index 1');
  });

  it('C-030 — says how CasparCG reads the number — slot position first, persistent ID second', async () => {
    const text =
      (await render(health(serverA('healthy', [missingDevice('23487013')])))).textContent ?? '';
    expect(text).toMatch(/slot position first/);
    expect(text).toMatch(/persistent ID second/);
  });

  it('C-030 — points at the startup log and names the search string and the two brackets', async () => {
    const text =
      (await render(health(serverA('healthy', [missingDevice('23487013')])))).textContent ?? '';
    expect(text).toMatch(/startup log/);
    expect(text).toMatch(/Decklink devices found/);
    expect(text).toMatch(/\[slot\] \(persistent ID\)/);
  });

  it('🔴 C-030 — does not widen what it claims to know: nothing about a consumer’s health', async () => {
    const text =
      (await render(health(serverA('healthy', [missingDevice('23487013')])))).textContent ?? '';
    expect(text).not.toMatch(/reference signal|dropping frames|unhappy/i);
  });

  it('a refused ADD says CasparCG could not open the device either', async () => {
    const check: ChannelOutputCheck = {
      ...missingDevice('23487013'),
      creation: {
        at: '2026-09-04T20:00:05.000Z',
        outcome: 'refused',
        command: 'ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO',
        code: 403,
      },
    };
    const text = (await render(health(serverA('healthy', [check])))).textContent ?? '';
    expect(text).toContain('ADD 1 DECKLINK 23487013 EMBEDDED_AUDIO');
    expect(text).toMatch(/refused \(403\)/);
    expect(text).toMatch(/cannot open that device either/);
  });
});

describe('B-223 — a local monitor is noted here, and only here', () => {
  it('🔴 a missing screen is a preview row: named, explained, and explicitly not an air matter', async () => {
    const el = await render(health(serverA('healthy', [SCREEN_ONLY])));
    expect(el.querySelector('[data-severity="air"]')).toBeNull();
    const local = el.querySelector('[data-severity="local"]');
    expect(local?.textContent).toContain('Preview');
    expect(local?.textContent).toContain('screen');
    expect(local?.textContent).toMatch(/preview window/);
    expect(local?.textContent).toMatch(/no effect on air/);
    expect(local?.textContent).toMatch(/Nothing for the operator to do/);
    // No remedy paragraph for a preview window.
    expect(el.textContent ?? '').not.toMatch(/restart CasparCG/);
  });

  it('a missing system-audio is the sound-device row', async () => {
    const check: ChannelOutputCheck = {
      ...SCREEN_ONLY,
      running: [
        { port: 23487313, kind: 'decklink' },
        { port: 600, kind: 'screen' },
      ],
      missing: [{ kind: 'system-audio', declared: 1, running: 0, devices: [] }],
    };
    const local = (await render(health(serverA('healthy', [check])))).querySelector(
      '[data-severity="local"]',
    );
    expect(local?.textContent).toContain('system-audio');
    expect(local?.textContent).toMatch(/sound device/);
  });

  it('a DeckLink and a screen both missing: one AIR row and one preview row', async () => {
    const check: ChannelOutputCheck = {
      ...missingDevice('23487013'),
      running: [{ port: 500, kind: 'system-audio' }],
      missing: [
        ...missingDevice('23487013').missing,
        { kind: 'screen', declared: 1, running: 0, devices: [] },
      ],
    };
    const el = await render(health(serverA('healthy', [check])));
    expect(el.querySelectorAll('[data-severity="air"]').length).toBe(1);
    expect(el.querySelectorAll('[data-severity="local"]').length).toBe(1);
  });
});

describe('B-223 — the states with nothing to alarm about are said plainly', () => {
  it('every declared consumer running', async () => {
    const check: ChannelOutputCheck = {
      ...SCREEN_ONLY,
      running: [...SCREEN_ONLY.running, { port: 600, kind: 'screen' }],
      missing: [],
    };
    const text = (await render(health(serverA('healthy', [check])))).textContent ?? '';
    expect(text).toContain('Every declared consumer is running');
  });

  it('no check completed yet', async () => {
    const text = (await render(health(serverA('healthy')))).textContent ?? '';
    expect(text).toContain('no output check has completed yet');
  });

  it('no health reading at all', async () => {
    const text = (await render(null)).textContent ?? '';
    expect(text).toContain('No health reading from the bridge yet');
  });

  it('an unreadable declaration is named as a gap', async () => {
    const check: ChannelOutputCheck = { ...SCREEN_ONLY, declared: null, missing: [] };
    const text = (await render(health(serverA('healthy', [check])))).textContent ?? '';
    expect(text).toMatch(/could not be read/);
  });

  it('a kept verdict on an unreachable server is dated and says it cannot be re-checked', async () => {
    const text =
      (await render(health(serverA('disconnected', [missingDevice('23487013')])))).textContent ??
      '';
    expect(text).toMatch(/last checked/);
    expect(text).toMatch(/cannot be re-checked/);
  });

  it('a declared backup server gets its own block', async () => {
    const text =
      (
        await render(
          health(serverA('healthy', [SCREEN_ONLY]), { ...serverA('healthy'), label: 'B' }),
        )
      ).textContent ?? '';
    expect(text).toContain('Channel 1 on server A');
    expect(text).toContain('Server B: no output check has completed yet');
  });
});

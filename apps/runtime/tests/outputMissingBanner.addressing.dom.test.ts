// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelOutputCheck, ServerHealth } from '@cg/shared-ipc';
import { OutputMissingStrip } from '../src/renderer/features/status/OutputMissingBanner.js';

/**
 * `C-030` — the banner names the ADDRESSING FORM the declaration uses and WHERE the number
 * comes from, so an operator who has never seen `casparcg.config` can act.
 *
 * Red-first: this file was written before the words existed and was run red (every case
 * below failed on the `C-029` banner), then the words were added. It pins the addition and
 * one boundary — the banner still says nothing about a consumer's health, which it cannot see.
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

async function renderStrip(server: ServerHealth): Promise<string> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(OutputMissingStrip, { server }));
  });
  return container.querySelector('[role="alert"]')?.textContent ?? '';
}

function missingDevice(device: string): ChannelOutputCheck {
  return {
    channel: 1,
    declared: [
      { kind: 'decklink', device, embeddedAudio: true, keyer: 'default' },
      { kind: 'screen' },
    ],
    running: [
      { port: 500, kind: 'system-audio' },
      { port: 600, kind: 'screen' },
    ],
    missing: [{ kind: 'decklink', declared: 1, running: 0, devices: [device] }],
    observedAt: '2026-09-04T20:00:00.000Z',
  };
}

const healthy = (check: ChannelOutputCheck): ServerHealth => ({
  label: 'A',
  state: 'healthy',
  amcpAxisOk: true,
  outputs: [check],
});

describe('C-030 — the banner names the addressing form and where the number comes from', () => {
  it('the plant’s declaration is called a hardware persistent ID, in plain words', async () => {
    const text = await renderStrip(healthy(missingDevice('23487013')));
    expect(text).toContain('hardware persistent ID 23487013');
    expect(text).not.toContain('slot index 23487013');
  });

  it('a small number is called a slot index', async () => {
    const text = await renderStrip(healthy(missingDevice('1')));
    expect(text).toContain('slot index 1');
  });

  it('says how CasparCG reads the number — slot position first, persistent ID second', async () => {
    const text = await renderStrip(healthy(missingDevice('23487013')));
    expect(text).toMatch(/slot position first/);
    expect(text).toMatch(/persistent ID second/);
  });

  it('points at the startup log and names the search string and the two brackets', async () => {
    const text = await renderStrip(healthy(missingDevice('23487013')));
    expect(text).toMatch(/startup log/);
    expect(text).toMatch(/Decklink devices found/);
    expect(text).toMatch(/\[slot\] \(persistent ID\)/);
  });

  it('🔴 does not widen what it claims to know: nothing about a consumer’s health', async () => {
    const text = await renderStrip(healthy(missingDevice('23487013')));
    expect(text).not.toMatch(/reference signal|dropping frames|unhappy/i);
  });
});

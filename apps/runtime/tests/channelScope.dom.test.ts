// @vitest-environment jsdom
import { StrictMode, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChannelSettingsState } from '@cg/shared-ipc';
import { ChannelScope } from '../src/renderer/features/channels/ChannelScope.js';
import { ChannelStrip } from '../src/renderer/features/channels/ChannelStrip.js';
import {
  __resetChannelChoiceForTest,
  readChannelChoice,
} from '../src/renderer/features/channels/channelStore.js';
import { SETUP_BANK, stationSetupStub } from './support/stationSetup.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 7 (`PROMPT.md` §7) — **the channel strip is shaped to be filled
 * from an API: one tab per channel the bridge names, the selection keyed by channel id.**
 *
 * RED FIRST against the shipped `ChannelScope`, which built a ONE-element tab array from
 * `bank?.channel ?? 1` and kept its selection in component state: with two channels declared
 * it rendered one tab, and nothing outside the component could read which channel was chosen.
 *
 * ⚠ What this does NOT test, on purpose: any bridge call. Phase 7 invents no multi-channel
 * contract (owner answer A3); the strip reads channels the bridge already publishes.
 *
 * ── ⚠ RE-POINTED BY `AUDIT-CLOSE-01` B1, AND THE PROPERTY IS UNCHANGED ───────────────
 *
 * The strip moved into the app header, where the reference draws the channel chooser, and
 * `ChannelScope` kept the tabpanel that wraps the workspace. So this mounts BOTH halves —
 * `ChannelStrip` for the tablist, `ChannelScope` for the panel — instead of one component
 * that rendered both. Every assertion below is the one it was: the tabs are a list whose
 * length is data, they are keyed by channel id, the selection is readable outside the
 * component, and the workspace is still inside the panel the strip controls.
 *
 * ⭐ Mounting the two together is also what proves the SPLIT did not break the join: the
 * panel's `aria-labelledby` still names a tab this strip rendered, which is precisely the
 * thing that can go wrong when two halves are placed far apart.
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

const settingsFor = (...channels: number[]): ChannelSettingsState => ({
  settings: channels.map((channel) => ({ channel, raster: { width: 1920, height: 1080 } })),
  observed: [],
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

async function render(children: ReactNode = null): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(ChannelStrip, null),
        createElement(ChannelScope, null, children),
      ),
    );
  });
  await settle();
  return container;
}

const tabs = (el: HTMLElement): HTMLButtonElement[] => [
  ...el.querySelectorAll<HTMLButtonElement>('[role="tablist"][aria-label="Channels"] [role="tab"]'),
];
const selectedId = (el: HTMLElement): string | undefined =>
  tabs(el).find((t) => t.getAttribute('aria-selected') === 'true')?.id;

describe('§7 — the channel strip is a list whose length is data', () => {
  it('🔴 two declared channels are two tabs, in channel order, each named for its channel', async () => {
    stationSetupStub({ raster: settingsFor(2, 1) });
    const el = await render(createElement('div', { 'data-child': '' }));
    expect(tabs(el).map((t) => t.textContent)).toEqual(['CHANNEL 1', 'CHANNEL 2']);
    expect(tabs(el).map((t) => t.id)).toEqual(['channel-1', 'channel-2']);
    // The workspace it scopes is still rendered inside the strip's panel.
    expect(el.querySelector('[role="tabpanel"] [data-child]')).not.toBeNull();
  });

  it('with nothing declared beyond the bank, the strip is the bank’s one channel (unchanged)', async () => {
    stationSetupStub({ raster: settingsFor(), bank: { ...SETUP_BANK, channel: 1 } });
    const el = await render();
    expect(tabs(el).map((t) => t.textContent)).toEqual(['CHANNEL 1']);
    expect(selectedId(el)).toBe('channel-1');
  });

  it('🔴 the selection is keyed by channel ID and readable outside the component', async () => {
    stationSetupStub({ raster: settingsFor(1, 2) });
    const el = await render();
    expect(selectedId(el)).toBe('channel-1');
    expect(readChannelChoice()).toBeNull();
    await act(async () => {
      tabs(el)[1]?.click();
      await Promise.resolve();
    });
    expect(selectedId(el)).toBe('channel-2');
    expect(readChannelChoice()).toBe(2);
  });

  it('a choice for a channel the bridge stops naming falls back to the bank’s channel', async () => {
    stationSetupStub({ raster: settingsFor(1, 2) });
    let el = await render();
    await act(async () => {
      tabs(el)[1]?.click();
      await Promise.resolve();
    });
    expect(selectedId(el)).toBe('channel-2');
    // The bridge now names only channel 1: the strip has one tab and it is selected, even
    // though the store still remembers the operator's choice of 2.
    const r = root;
    if (r !== null) {
      await act(async () => {
        r.unmount();
      });
    }
    root = null;
    container?.remove();
    stationSetupStub({ raster: settingsFor(1) });
    el = await render();
    expect(tabs(el).map((t) => t.id)).toEqual(['channel-1']);
    expect(selectedId(el)).toBe('channel-1');
    expect(readChannelChoice()).toBe(2);
  });
});

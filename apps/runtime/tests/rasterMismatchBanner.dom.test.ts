// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ChannelSettingsState } from '@cg/shared-ipc';
import { RasterMismatchBanner } from '../src/renderer/features/status/RasterMismatchBanner.js';
import { colors, cssVars } from '../src/renderer/theme.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 9 — deletion guard item 7, the raster-mismatch banner (`R-030`).
 *
 * 🔴 NO TEST FILE IN THE TREE REFERENCED THIS COMPONENT before Phase 9; the plant that made its
 * render unreachable left 1318 tests green. The banner is judged on the verdict it renders FOR
 * and, as much, on the three verdicts it must stay silent on — `rasterVerdict` is the one
 * canonical predicate (golden rule 6) and this file drives every member of its union:
 *
 *   - `mismatch`     — the alarm: both rasters named, so the operator can tell which side is wrong;
 *   - `unreadable`   — the mode was read and is not one this build knows: a GAP in the check, not
 *                      an alarm; shouting here would train the operator to dismiss the banner;
 *   - `unconfigured` — no claim to check;
 *   - `match`        — the only reassuring verdict, and it is rendered as ABSENCE.
 *
 * Fed through `useChannelSettings` → `useBridgeSnapshot`, so the test drives the bridge's
 * snapshot and its push, exactly as the app does.
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

type Listener = (next: ChannelSettingsState) => void;

async function mount(
  state: ChannelSettingsState,
): Promise<{ el: HTMLElement; push: (next: ChannelSettingsState) => Promise<void> }> {
  const listeners = new Set<Listener>();
  const stub = {
    link: {
      status: () => 'live' as const,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
    channelSettings: {
      get: () => Promise.resolve(state),
      onChanged: (l: Listener) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, createElement(RasterMismatchBanner)));
  });
  // Let the snapshot pull land.
  await act(async () => {
    await Promise.resolve();
  });
  return {
    el: container,
    push: async (next) => {
      await act(async () => {
        for (const l of listeners) l(next);
      });
    },
  };
}

const banner = (el: HTMLElement): HTMLElement | null =>
  el.querySelector('[role="alert"][aria-label="Channel raster mismatch"]');

const HD = { width: 1920, height: 1080 };
const PAL = { width: 720, height: 576 };

describe('guard item 7 — the raster-mismatch banner renders on mismatch and on nothing else', () => {
  it('MISMATCH — names the channel and BOTH rasters, and says every graphic is mis-placed', async () => {
    const { el } = await mount({
      settings: [{ channel: 1, raster: HD }],
      observed: [{ channel: 1, mode: 'PAL', raster: PAL }],
    });
    const b = banner(el);
    expect(b, 'the banner did not render for a genuine mismatch').not.toBeNull();
    expect(b?.textContent).toContain('CHANNEL RASTER MISMATCH');
    expect(b?.textContent).toContain('MIS-PLACED');
    expect(b?.textContent).toContain(
      'Channel 1: configured 1920×1080, server reports 720×576 (PAL)',
    );
    // The remedy names AIR, not a file (`B-236`).
    expect(b?.textContent).toContain('never while anything is on air');
  });

  it('UNREADABLE — a mode this build cannot map renders NOTHING (a gap in the check, not an alarm)', async () => {
    const { el } = await mount({
      settings: [{ channel: 1, raster: HD }],
      observed: [{ channel: 1, mode: 'weird-mode', raster: null }],
    });
    expect(banner(el)).toBeNull();
  });

  it('UNREADABLE — a channel the server never answered for renders NOTHING', async () => {
    const { el } = await mount({ settings: [{ channel: 1, raster: HD }], observed: [] });
    expect(banner(el)).toBeNull();
  });

  it('UNCONFIGURED — an observed channel with no configured claim renders NOTHING', async () => {
    const { el } = await mount({
      settings: [],
      observed: [{ channel: 1, mode: '1080i5000', raster: HD }],
    });
    expect(banner(el)).toBeNull();
  });

  it('MATCH — agreement is rendered as absence', async () => {
    const { el } = await mount({
      settings: [{ channel: 1, raster: HD }],
      observed: [{ channel: 1, mode: '1080i5000', raster: HD }],
    });
    expect(banner(el)).toBeNull();
  });

  it('follows the bridge: adoption clearing the mismatch takes the banner down', async () => {
    const { el, push } = await mount({
      settings: [{ channel: 1, raster: HD }],
      observed: [{ channel: 1, mode: 'PAL', raster: PAL }],
    });
    expect(banner(el)).not.toBeNull();
    await push({
      settings: [{ channel: 1, raster: PAL }],
      observed: [{ channel: 1, mode: 'PAL', raster: PAL }],
    });
    expect(banner(el)).toBeNull();
  });

  it('is an AIR alarm: it fills with the error role, never the caution ground (A4 / 2A)', async () => {
    const { el } = await mount({
      settings: [{ channel: 1, raster: HD }],
      observed: [{ channel: 1, mode: 'PAL', raster: PAL }],
    });
    const asRendered = (token: string): string => {
      const probe = document.createElement('span');
      probe.style.color = token;
      return probe.style.color;
    };
    const fill = (banner(el) as HTMLElement).style.backgroundColor;
    expect(fill).not.toBe('');
    expect(colors.alarmFill).toBeTruthy();
    expect(fill).toBe(asRendered(colors.alarmFill));
    expect(cssVars['--r-caution-bg']).toBeTruthy();
    expect(fill).not.toBe(asRendered(cssVars['--r-caution-bg']));
  });
});

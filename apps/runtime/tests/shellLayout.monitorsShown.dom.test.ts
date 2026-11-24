// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INSPECTOR_PX,
  DEFAULT_MONITOR_PX,
  DEFAULT_MONITORS_SHOWN,
  DEFAULT_WORKSPACE_POSITIONS,
  useShellLayout,
  type ConfigurableShellLayout,
} from '../src/renderer/hooks/useShellLayout.js';
import type { FloatingPanelPlacement } from '../src/shared/floating-panels.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * `RUNTIME-REDESIGN-01` PHASE 5 — the shell's `monitorsShown` flag: its own axis (fullscreen
 * focus and the sizes are untouched by it), returned to the default by `reset()`, counted as
 * a customisation so the reset control appears, and NEVER persisted — the phase's constraint
 * is no persisted key, file or shape change, and `cg.runtime.shell-layout.v1` keeps its
 * `{inspectorPx, monitorPx, focus}` shape.
 *
 * Also pins the two defaults the phase moved to the reference's rendered numbers.
 *
 * ── 🔴 `MONITORS-01`, 2026-09-09 — THE DEFAULT MOVED; THE PERSISTENCE RULE DID NOT ─────
 *
 * The boot state is now HIDDEN (`DEFAULT_MONITORS_SHOWN`), because neither box was confidence monitoring — PGM was then an empty placeholder for `C-016` (since built as the Playout's return, still off by default) and PVW is a local browser
 * render of the rehearsal (`R-022`, nothing reaches CasparCG). See `design.md` §19.
 *
 * ⚠ THE ASSERTIONS BELOW ARE WRITTEN AGAINST THE CONSTANT, NOT AGAINST `false`, and that is
 * deliberate: a default is the owner's to set and may move again, while the three PROPERTIES
 * this file exists to hold — the flag is its own axis, `reset()` returns it to the shipped
 * state, and NOTHING about it is ever written to storage — must survive that move untouched.
 * A test spelling `false` here would have to be re-edited by the next person to change the
 * default, which is how a property test decays into a value test.
 *
 * The one place the literal IS spelled is the boot-state case, which asserts the DECISION.
 */

const KEY = 'cg.runtime.shell-layout.v1';

let root: Root | null = null;
let host: HTMLDivElement | null = null;
let latest: ConfigurableShellLayout | null = null;
let storage: Storage;

function Probe(): null {
  latest = useShellLayout();
  return null;
}

beforeEach(async () => {
  // A real, readable store — jsdom's opaque origin has none, and an absent store would
  // make "nothing was persisted" true of everything.
  storage = installMemoryStorage();
  storage.clear();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(createElement(Probe));
  });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
  latest = null;
});

function layout(): ConfigurableShellLayout {
  if (latest === null) throw new Error('hook did not render');
  return latest;
}

async function reload(): Promise<void> {
  if (host === null) throw new Error('probe host is missing');
  act(() => root?.unmount());
  root = createRoot(host);
  await act(async () => root?.render(createElement(Probe)));
}

describe('local workspace settings', () => {
  it('keeps old records readable and persists named layouts without session visibility', async () => {
    storage.setItem(KEY, JSON.stringify({ inspectorPx: 370, monitorPx: 205, focus: 'none' }));
    await reload();
    expect(layout().positions).toEqual(DEFAULT_WORKSPACE_POSITIONS);
    expect(layout().inspectorPx).toBe(370);
    expect(layout().monitorPx).toBe(205);
    expect(layout().floatingPanels).toEqual({});

    const reversed = {
      monitorOrder: 'pgm-first',
      layerPosition: 'above',
      inspectorSide: 'left',
    } as const;
    await act(async () => {
      layout().setPositions(reversed);
      await layout().saveProfile('Gallery');
      layout().setPositions(DEFAULT_WORKSPACE_POSITIONS);
      layout().setInspectorPx(300);
      layout().setMonitorsShown(true);
      layout().loadProfile('Gallery');
    });
    expect(layout().positions).toEqual(reversed);
    expect(layout().inspectorPx).toBe(370);
    expect(layout().monitorsShown).toBe(true);
    const stored: unknown = JSON.parse(storage.getItem(KEY) ?? '{}');
    expect(stored).not.toHaveProperty('monitorsShown');
    expect(stored).toMatchObject({
      positions: reversed,
      uiProfiles: [{ name: 'Gallery', positions: reversed }],
    });

    await reload();
    expect(layout().positions).toEqual(reversed);
    expect(layout().monitorsShown).toBe(DEFAULT_MONITORS_SHOWN);
    await act(async () => layout().reset());
    expect(layout().positions).toEqual(DEFAULT_WORKSPACE_POSITIONS);
    expect(layout().uiProfiles.map(({ name }) => name)).toEqual(['Gallery']);
  });

  it('saves native restore bounds by profile and applies a legacy docked profile', async () => {
    storage.setItem(
      KEY,
      JSON.stringify({
        uiProfiles: [{ name: 'Docked', inspectorPx: 370, monitorPx: 205 }],
      }),
    );
    await reload();
    const placement: FloatingPanelPlacement = {
      left: -1800,
      top: -100,
      width: 800,
      height: 600,
      displayId: 'gallery',
      maximized: true,
    };
    await act(async () => {
      layout().setFocus('pvw');
      layout().setFloatingPanel('pvw', placement);
      await layout().saveProfile('Floating');
      layout().setFloatingPanel('pvw', { ...placement, width: 640 });
      layout().setFocus('pvw');
    });
    expect(layout().focus).toBe('none');
    expect(layout().floatingPanels.pvw?.width).toBe(640);
    expect(layout().customized).toBe(true);
    await reload();
    expect(layout().floatingPanels.pvw?.width).toBe(640);

    await act(async () => layout().loadProfile('Floating'));
    expect(layout().floatingPanels).toEqual({ pvw: placement });
    await act(async () => layout().loadProfile('Docked'));
    expect(layout().floatingPanels).toEqual({});
    expect(layout().inspectorPx).toBe(370);
    expect(JSON.parse(storage.getItem(KEY) ?? '{}')).not.toHaveProperty('floatingPanels');

    await act(async () => {
      layout().loadProfile('Floating');
      layout().reset();
    });
    expect(layout().floatingPanels).toEqual({});
    expect(layout().uiProfiles).toContainEqual(
      expect.objectContaining({ name: 'Floating', floatingPanels: { pvw: placement } }),
    );
  });

  it('ignores invalid or unsupported native placements from layout storage and profile records', async () => {
    const pgm = { left: -800, top: 200, width: 640, height: 480 };
    const floatingPanels = {
      pgm,
      pvw: { ...pgm, width: 0 },
      layers: { ...pgm, height: -480 },
      inspector: { ...pgm, left: 2 ** 33 },
      unknown: { ...pgm },
    };
    storage.setItem(
      KEY,
      JSON.stringify({
        focus: 'pgm',
        floatingPanels,
        uiProfiles: [{ name: 'Partial', floatingPanels }],
      }),
    );
    await reload();
    expect(layout().focus).toBe('none');
    expect(layout().floatingPanels).toEqual({ pgm });
    expect(layout().uiProfiles[0]?.floatingPanels).toEqual({ pgm });

    await act(async () => {
      layout().setFloatingPanel('pgm', { ...pgm, width: 640.5 });
      layout().setFloatingPanel('pvw', { ...pgm, height: Number.POSITIVE_INFINITY });
    });
    expect(layout().floatingPanels).toEqual({ pgm });
    await act(async () => layout().setFloatingPanel('pgm', null));
    expect(layout().floatingPanels).toEqual({});
  });

  it('samples current native window geometry when saving a profile, with a fallback per pane', async () => {
    const last = { left: 100, top: 200, width: 640, height: 480 };
    const actual = { ...last, left: -1000, width: 800, displayId: 'second', maximized: true };
    const original = Object.getOwnPropertyDescriptor(window, 'cg');
    Object.defineProperty(window, 'cg', {
      configurable: true,
      value: {
        floatingPanels: {
          async placement(panel: string) {
            if (panel === 'pgm') return actual;
            throw new Error('The other window is moving');
          },
        },
      },
    });
    try {
      await act(async () => {
        layout().setFloatingPanel('pgm', last);
        layout().setFloatingPanel('inspector', last);
        await layout().saveProfile('Desk');
      });
      expect(layout().uiProfiles[0]?.floatingPanels).toEqual({ pgm: actual, inspector: last });
      expect(layout().floatingPanels).toEqual({ pgm: last, inspector: last });
    } finally {
      if (original === undefined) Reflect.deleteProperty(window, 'cg');
      else Object.defineProperty(window, 'cg', original);
    }
  });
});

describe('useShellLayout — monitorsShown', () => {
  it('boots with the monitors HIDDEN — the decision, spelled', () => {
    // The one literal in this file. `MONITORS-01`: the strip is a rehearsal/preview surface,
    // not confidence monitoring, so it does not take 247.2 px of the layer list unasked.
    expect(DEFAULT_MONITORS_SHOWN).toBe(false);
    expect(layout().monitorsShown).toBe(false);
  });

  it('boots at the shipped default, and the sizes are the reference’s rendered ones', () => {
    expect(layout().monitorsShown).toBe(DEFAULT_MONITORS_SHOWN);
    expect(layout().customized).toBe(false);
    expect(DEFAULT_INSPECTOR_PX).toBe(396);
    expect(DEFAULT_MONITOR_PX).toBe(230);
    expect(layout().inspectorPx).toBe(396);
    expect(layout().monitorPx).toBe(230);
  });

  it('toggling flips the flag alone — focus and sizes stay — and counts as customised', async () => {
    await act(async () => {
      layout().setMonitorsShown(!DEFAULT_MONITORS_SHOWN);
    });
    expect(layout().monitorsShown).toBe(!DEFAULT_MONITORS_SHOWN);
    expect(layout().focus).toBe('none');
    expect(layout().inspectorPx).toBe(DEFAULT_INSPECTOR_PX);
    expect(layout().monitorPx).toBe(DEFAULT_MONITOR_PX);
    expect(layout().customized).toBe(true);
  });

  it('is NOT persisted: nothing is written for it, and the stored shape keeps its three keys', async () => {
    // A13 / `R-060`, unchanged by the default's move — asserted in the direction the operator
    // can actually take from the boot state.
    await act(async () => {
      layout().setMonitorsShown(!DEFAULT_MONITORS_SHOWN);
    });
    expect(storage.getItem(KEY)).toBeNull();
    // A size write still carries exactly the shape it always did — and the instrument is
    // live: this write IS observed.
    await act(async () => {
      layout().setInspectorPx(400);
    });
    const raw = storage.getItem(KEY);
    expect(raw).not.toBeNull();
    expect(Object.keys(JSON.parse(raw ?? '{}') as object).sort()).toEqual([
      'focus',
      'inspectorPx',
      'monitorPx',
    ]);
  });

  it('reset() returns the monitors to the shipped default with everything else', async () => {
    await act(async () => {
      layout().setMonitorsShown(!DEFAULT_MONITORS_SHOWN);
      layout().setInspectorPx(400);
    });
    expect(layout().monitorsShown).toBe(!DEFAULT_MONITORS_SHOWN);
    await act(async () => {
      layout().reset();
    });
    expect(layout().monitorsShown).toBe(DEFAULT_MONITORS_SHOWN);
    expect(layout().inspectorPx).toBe(DEFAULT_INSPECTOR_PX);
    expect(layout().customized).toBe(false);
  });

  it('a reload starts at the DEFAULT whatever the last session did — it is session state', async () => {
    await act(async () => {
      layout().setMonitorsShown(!DEFAULT_MONITORS_SHOWN);
    });
    await reload();
    expect(layout().monitorsShown).toBe(DEFAULT_MONITORS_SHOWN);
  });
});

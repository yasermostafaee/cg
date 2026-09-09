// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INSPECTOR_PX,
  DEFAULT_MONITOR_PX,
  DEFAULT_MONITORS_SHOWN,
  useShellLayout,
  type ShellLayout,
} from '../src/renderer/hooks/useShellLayout.js';
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
 * The boot state is now HIDDEN (`DEFAULT_MONITORS_SHOWN`), because neither box is confidence
 * monitoring — PGM is an empty placeholder for the unbuilt `C-016` and PVW is a local browser
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
let latest: ShellLayout | null = null;
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

function layout(): ShellLayout {
  if (latest === null) throw new Error('hook did not render');
  return latest;
}

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
    act(() => root?.unmount());
    root = createRoot(host as HTMLDivElement);
    await act(async () => {
      root?.render(createElement(Probe));
    });
    expect(layout().monitorsShown).toBe(DEFAULT_MONITORS_SHOWN);
  });
});

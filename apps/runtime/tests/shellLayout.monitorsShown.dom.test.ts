// @vitest-environment jsdom
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_INSPECTOR_PX,
  DEFAULT_MONITOR_PX,
  useShellLayout,
  type ShellLayout,
} from '../src/renderer/hooks/useShellLayout.js';
import { installMemoryStorage } from './support/localStorage.js';

/**
 * `RUNTIME-REDESIGN-01` PHASE 5 — the shell's `monitorsShown` flag: shown by default, its own
 * axis (fullscreen focus and the sizes are untouched by it), restored by `reset()`, counted
 * as a customisation so the reset control appears, and NEVER persisted — the phase's
 * constraint is no persisted key, file or shape change, and `cg.runtime.shell-layout.v1`
 * keeps its `{inspectorPx, monitorPx, focus}` shape.
 *
 * Also pins the two defaults the phase moved to the reference's rendered numbers.
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
  it('defaults to SHOWN, and the defaults are the reference’s rendered sizes', () => {
    expect(layout().monitorsShown).toBe(true);
    expect(layout().customized).toBe(false);
    expect(DEFAULT_INSPECTOR_PX).toBe(396);
    expect(DEFAULT_MONITOR_PX).toBe(230);
    expect(layout().inspectorPx).toBe(396);
    expect(layout().monitorPx).toBe(230);
  });

  it('hiding flips the flag alone — focus and sizes stay — and counts as customised', async () => {
    await act(async () => {
      layout().setMonitorsShown(false);
    });
    expect(layout().monitorsShown).toBe(false);
    expect(layout().focus).toBe('none');
    expect(layout().inspectorPx).toBe(DEFAULT_INSPECTOR_PX);
    expect(layout().monitorPx).toBe(DEFAULT_MONITOR_PX);
    expect(layout().customized).toBe(true);
  });

  it('is NOT persisted: nothing is written for it, and the stored shape keeps its three keys', async () => {
    await act(async () => {
      layout().setMonitorsShown(false);
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

  it('reset() brings the monitors back with everything else', async () => {
    await act(async () => {
      layout().setMonitorsShown(false);
      layout().setInspectorPx(400);
    });
    expect(layout().monitorsShown).toBe(false);
    await act(async () => {
      layout().reset();
    });
    expect(layout().monitorsShown).toBe(true);
    expect(layout().inspectorPx).toBe(DEFAULT_INSPECTOR_PX);
    expect(layout().customized).toBe(false);
  });

  it('a reload starts SHOWN whatever the last session did — it is session state', async () => {
    await act(async () => {
      layout().setMonitorsShown(false);
    });
    act(() => root?.unmount());
    root = createRoot(host as HTMLDivElement);
    await act(async () => {
      root?.render(createElement(Probe));
    });
    expect(layout().monitorsShown).toBe(true);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionConfig } from '@cg/shared-ipc';
import { clearPortals } from './support/dialog.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import {
  SETUP_CONFIG,
  renderStationSetup,
  reopenStationSetup,
  setSetupInput,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * 🔴 `MODAL-TRUTH-01` §2 — **CLOSING STATION SETUP DISCARDS THE UNAPPLIED DRAFT; REOPENING
 * READS THE APPLIED CONFIGURATION.**
 *
 * The owner reported a field that survived a dismissal and read exactly like an applied
 * value. It is the same failure class as the two Audit-log defects beside it, and as the
 * three that cost the 2026-09-21/22 Playout week: a surface asserting a state that is not
 * in force.
 *
 * ── WHY THREE PANES, WHEN ONLY ONE WAS BROKEN ───────────────────────────────
 *
 * `App` keeps the dialog MOUNTED and toggles `open`, so every section BELOW it unmounts on
 * close and drops its draft for free — the bank's aliases and the Live sources band both
 * did, measured, before anything here changed. Only the SERVERS fields live in the dialog's
 * own `useState`, which survives. The two panes that were already right are pinned here
 * anyway: the contract is "closing discards", not "closing happens to unmount", and the day
 * a section is kept alive for a cache the difference stops being free.
 *
 * ⚠ **The bridge is NOT allowed to be the thing that fixes it.** The last case below holds a
 * `connections.config()` that never answers, which is the station whose bridge is down —
 * the station whose operator is most likely to be in this dialog. A re-read that has not
 * landed cannot make a surface honest.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

function valueOf(el: HTMLElement, ariaLabel: string): string {
  const input = el.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (input === null) throw new Error(`input "${ariaLabel}" not rendered`);
  return input.value;
}

function bankRowLabel(el: HTMLElement, layer: number): string {
  const input = el.querySelector<HTMLInputElement>(
    `input[aria-label^="Name for layer ${String(layer)} "]`,
  );
  if (input === null) throw new Error(`no name field for layer ${String(layer)}`);
  return input.getAttribute('aria-label') ?? '';
}

describe('MODAL-TRUTH-01 — Station setup discards an unapplied draft on close', () => {
  it('SERVERS — a typed host is gone the moment it reopens, BEFORE the bridge answers', async () => {
    /*
      The reopen's `connections.config()` is held open, so the only thing that can have put
      `127.0.0.1` back in the field is the discard at CLOSE. With a stub that answers
      immediately this assertion is satisfied by the re-read and says nothing about the
      defect — which is why the gate is here rather than a plain reopen.
    */
    stationSetupStub();
    let el = await renderStationSetup({ section: 'servers' });
    expect(valueOf(el, 'Primary host')).toBe('127.0.0.1');

    await setSetupInput(el, 'Primary host', '10.0.0.9');
    await setSetupInput(el, 'Primary AMCP port', '5999');
    expect(valueOf(el, 'Primary host')).toBe('10.0.0.9');

    let answer: (() => void) | null = null;
    const held = new Promise<void>((r) => {
      answer = r;
    });
    const stored = SETUP_CONFIG;
    (
      window.cg as unknown as { connections: { config: () => Promise<ConnectionConfig> } }
    ).connections.config = () => held.then(() => stored);

    el = await reopenStationSetup();
    expect(valueOf(el, 'Primary host')).toBe('127.0.0.1');
    expect(valueOf(el, 'Primary AMCP port')).toBe('5250');
    expect(answer, 'the reopen read was never made').not.toBeNull();
  });

  it('SERVERS — the discard does NOT wait on the bridge: a config() that never answers', async () => {
    stationSetupStub();
    let el = await renderStationSetup({ section: 'servers' });
    expect(valueOf(el, 'Primary host')).toBe('127.0.0.1');
    await setSetupInput(el, 'Primary host', '10.0.0.9');

    // The bridge goes away AFTER the first read landed — the station whose operator opens
    // Station setup to find out why. Nothing will answer the reopen's read.
    (window.cg as unknown as { connections: { config: () => Promise<never> } }).connections.config =
      () => new Promise<never>(() => undefined);

    el = await reopenStationSetup();
    expect(valueOf(el, 'Primary host')).toBe('127.0.0.1');
  });

  it('SERVERS — a stale outcome sentence does not survive the close either', async () => {
    stationSetupStub({ setConfigResult: { ok: false, message: 'The bridge refused that host.' } });
    let el = await renderStationSetup({ section: 'servers' });
    await setSetupInput(el, 'Primary host', '10.0.0.9');
    const apply = el.querySelector<HTMLButtonElement>('button[aria-label="Apply server settings"]');
    if (apply === null) throw new Error('Apply servers not rendered');
    apply.click();
    await reopenStationSetup();

    el = await reopenStationSetup();
    expect(el.textContent).not.toContain('The bridge refused that host.');
  });

  it('LAYERS — a typed row name is gone on reopen (already held; pinned)', async () => {
    stationSetupStub();
    let el = await renderStationSetup({ section: 'candidate-layers' });
    const label = bankRowLabel(el, 70);
    expect(valueOf(el, label)).toBe('CLOCK');

    await setSetupInput(el, label, 'SCOREBOARD');
    expect(valueOf(el, label)).toBe('SCOREBOARD');

    el = await reopenStationSetup({ section: 'candidate-layers' });
    expect(valueOf(el, label)).toBe('CLOCK');
  });

  it('LIVE SOURCES — a typed layer band is gone on reopen (already held; pinned)', async () => {
    stationSetupStub({ catalog: { sources: [], layerRange: { start: 60, end: 79 } } });
    __resetSourcesForTest();
    initSources(window.cg as never);
    let el = await renderStationSetup({ section: 'sources' });
    expect(valueOf(el, 'Live source band start layer')).toBe('60');

    await setSetupInput(el, 'Live source band start layer', '61');
    expect(valueOf(el, 'Live source band start layer')).toBe('61');

    el = await reopenStationSetup({ section: 'sources' });
    expect(valueOf(el, 'Live source band start layer')).toBe('60');
  });
});

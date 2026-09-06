// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';
import { clearPortals, openDialog } from './support/dialog.js';
import {
  renderStationSetup,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

/**
 * `STATION-SETUP-02` §3 — **SIX THINGS THAT MUST NOT MOVE INTO STATION SETUP, PROVED.**
 *
 * The settings home pulled five surfaces in. Six were left where they are, each for a
 * reason that is a property of the operator's moment, not of the data's ownership:
 *
 *  1. the OPERATOR NAME — the Audit panel puts it beside the actor column ON PURPOSE,
 *     because the "self-declared and unverified" caveat must sit beside what it qualifies;
 *     moving the field without the caveat re-creates `B-143`;
 *  2. the LOCK PIN — one press from the status bar, engaged while walking away from a desk;
 *  3. PANEL WIDTHS and the Inspector overlay — per operator, per screen, not bridge config;
 *  4. PER-PLATE AUDIO, the PER-ROW SOURCE OVERRIDE and the ON-AIR POSITION — reached during
 *     a live interview, from the row or the Inspector;
 *  5. the PLATE→SOURCE ASSIGNMENTS — per template, beside the fields they bind (§6: the
 *     catalog in Station setup is the OTHER of the two shapes);
 *  6. the STACK — it is the work, not a setting.
 *
 * Each is asserted TWO ways: it is still reachable from where it is today (a render, or the
 * source of the surface that renders it), and Station setup acquired NO second control for
 * it (the rendered dialog, and the source under `features/stationSetup/`).
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
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
    await Promise.resolve();
    await Promise.resolve();
  });
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
  return container;
}

const rendererDir = join(process.cwd(), 'src', 'renderer');

function read(...segments: string[]): string {
  return readFileSync(join(rendererDir, ...segments), 'utf8');
}

/** Every source file of the settings home, concatenated — what it imports and calls. */
function stationSetupSource(): string {
  const dir = join(rendererDir, 'features', 'stationSetup');
  const own = readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf8'));
  // …plus the three moved section bodies, which are the dialog's content too.
  return [
    ...own,
    read('features', 'sources', 'SourcesSection.tsx'),
    read('features', 'inspector', 'DelimitersSection.tsx'),
    read('features', 'fixedLayers', 'CandidateLayersSection.tsx'),
  ].join('\n');
}

const HEALTH: ConnectionHealth = {
  primary: { label: 'A', state: 'healthy', amcpAxisOk: true },
  currentPrimary: 'A',
  strategy: 'mirror-sync',
};

describe('§3 — the six that did not move', () => {
  it('1. the operator name is still in the Audit panel, beside its caveat — and nowhere in Station setup', async () => {
    (window as unknown as { cg: unknown }).cg = {
      audit: {
        recent: () => Promise.resolve([]),
        health: () => Promise.resolve({ path: null, writable: false, lastError: null }),
        operatorName: () => 'desk 2',
        setOperatorName: () => undefined,
      },
      templates: { list: () => Promise.resolve([]) },
      fixedLayers: { config: () => Promise.resolve(null), onConfigChanged: () => () => undefined },
    };
    await render(createElement(AuditPanel, { open: true, onClose: () => undefined }));
    const audit = openDialog();
    const field = audit?.querySelector<HTMLInputElement>('#audit-operator');
    expect(field?.value).toBe('desk 2');
    // The CAVEAT, beside the field — the half `B-143` says must travel with it.
    expect(audit?.textContent).toContain('not a verified sign-in');
    expect(audit?.textContent).toContain('which console, not which person');
    await act(async () => {
      root?.unmount();
    });
    root = null;
    clearPortals();

    stationSetupStub();
    const setup = await renderStationSetup();
    expect(setup.querySelector('#audit-operator')).toBeNull();
    expect(setup.textContent).not.toContain('This console');
    expect(stationSetupSource()).not.toMatch(/\b(setOperatorName|operatorName)\(/);
  });

  it('2. the lock PIN is still one press from the status bar — and Station setup has no lock control', async () => {
    const stub = {
      connections: {
        health: () => Promise.resolve(HEALTH),
        onHealthChanged: () => () => undefined,
        failover: () => Promise.resolve({ ok: false, newPrimary: 'A' as const }),
      },
      lock: {
        state: () => Promise.resolve({ engaged: false }),
        onStateChanged: () => () => undefined,
        engage: () => Promise.resolve({ ok: true }),
      },
      link: {
        status: () => 'live' as const,
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
    const bar = await render(createElement(StatusBar));
    const lock = [...bar.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Lock…'),
    );
    expect(lock, 'the lock is a status-bar press').toBeDefined();
    await act(async () => {
      root?.unmount();
    });
    root = null;

    stationSetupStub();
    const setup = await renderStationSetup();
    expect(
      [...setup.querySelectorAll('button')].some((b) => /lock/i.test(b.textContent ?? '')),
    ).toBe(false);
    expect(setup.querySelector('input[type="password"]')).toBeNull();
    // Calls and imports, never prose: a comment may NAME the lock while explaining why it
    // is not here, and a census that reads comments as controls cries wolf.
    expect(stationSetupSource()).not.toMatch(/window\.cg\.lock|usePrompt\(/);
  });

  it('3. panel widths and the Inspector overlay stay with the shell — Station setup renders no layout control', async () => {
    // Where they live today: the shell's dividers and the Layers header's reset.
    const app = read('App.tsx');
    expect(app).toContain('label="Resize the Inspector"');
    expect(app).toContain('label="Resize the monitor strip"');
    expect(read('features', 'layers', 'LayersPanel.tsx')).toContain('Reset the panel layout');

    stationSetupStub();
    const setup = await renderStationSetup();
    expect(setup.querySelector('[aria-label^="Resize"]')).toBeNull();
    expect(setup.querySelector('[aria-label="Reset the panel layout"]')).toBeNull();
    expect(stationSetupSource()).not.toMatch(
      /from '.*\/(useShellLayout|ShellDivider|shellLayoutContext)\.js'/,
    );
  });

  it('4. per-plate audio, the per-row source override and the on-air position stay on the row and in the Inspector', async () => {
    // Where they live today.
    const row = read('features', 'layers', 'LayerRow.tsx');
    expect(row).toContain('<LivePlateAudioDialog');
    expect(row).toContain('<LiveSourceSwapDialog');
    expect(read('features', 'inspector', 'PositionPicker.tsx')).toContain(
      'aria-label="Apply position"',
    );

    stationSetupStub();
    const setup = await renderStationSetup();
    expect(setup.querySelector('[aria-label="Apply position"]')).toBeNull();
    expect(setup.textContent).not.toMatch(/Apply position|Swap source|Plate audio/);
    expect(stationSetupSource()).not.toMatch(/\b(swapLiveSource|setPlateVolumes?|setPosition)\(/);
    expect(stationSetupSource()).not.toMatch(
      /from '.*\/(PositionPicker|LivePlateAudioDialog|LiveSourceSwapDialog)\.js'/,
    );
  });

  it('5. plate→source assignments stay in the Inspector — Station setup never binds a plate (§6)', async () => {
    // Where they live today: the Inspector's Live plates section stages, `applyDraft` commits.
    expect(read('features', 'inspector', 'LivePlatesSection.tsx')).toContain('Source for');
    expect(read('features', 'inspector', 'applyDraft.ts')).toContain('commitSourceAssignments');

    stationSetupStub();
    const setup = await renderStationSetup({ section: 'sources' });
    expect(setup.querySelector('select[aria-label^="Source for"]')).toBeNull();
    expect(setup.querySelector('[data-plate-unassigned]')).toBeNull();
    // §6 — the two shapes: the settings home reaches the CATALOG channel only. Its source
    // never names the assignments writer, on either seam.
    expect(stationSetupSource()).not.toMatch(/\b(setAssignments|commitSourceAssignments)\(/);
    expect(stationSetupSource()).toMatch(/\bcommitSourceCatalog\(/);
  });

  it('6. the stack is the work, not a setting — Station setup renders no layer row', async () => {
    stationSetupStub({
      items: [{ itemId: 'i1', templateId: 't1', fields: {}, status: 'loaded', pending: false }],
    });
    const setup = await renderStationSetup();
    expect(setup.querySelector('.cg-row')).toBeNull();
    expect(setup.querySelector('[data-layer]')).toBeNull();
    expect(
      [...setup.querySelectorAll('button')].some((b) =>
        /^(PLAY|TAKE|STOP|CLEAR)$/.test(b.textContent ?? ''),
      ),
    ).toBe(false);
    // The import form: `liveLayerRows.ts` is NAMED in a comment as where the row join lives,
    // and that sentence is the opposite of rendering a row.
    expect(stationSetupSource()).not.toMatch(/from '.*\/(LayerRow|LayersPanel)\.js'/);
  });
});

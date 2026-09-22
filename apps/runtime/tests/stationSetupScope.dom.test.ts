// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { StatusBar } from '../src/renderer/features/status/StatusBar.js';
import { clearPortals } from './support/dialog.js';
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
  /*
    🔴 `OPERATOR-NAME-SWEEP-01` — **CASE 1 OF SIX IS RETIRED, because the thing it scoped is
    gone from BOTH sides.**

    It asserted that the operator-name field lived in the Audit panel beside its caveat and
    NOT in Station setup — a real scope decision when the field existed, and the proof
    `StationSetupDialog.tsx`'s own "what deliberately did not move in" comment pointed at.

    Identity is proven now (`C-037`/`C-038`), the field and its caveat are retired, and a
    guard asserting "it is here, not there" about something that is NOWHERE would pass for the
    wrong reason — the shape this repo calls a vacuous test. The five other cases below are
    untouched: each still scopes a control that exists.

    ⚠ What replaces it is not another absence check here. `operatorNameRetired.test.ts` is the
    permanent two-axis guard, and it fails if either the symbol or the sentence comes back
    anywhere in source — which is the property this case would now be trying to express.
  */

  it('2. the lock PIN is still one press from the status bar — and Station setup has no lock control', async () => {
    const stub = {
      connections: {
        health: () => Promise.resolve(HEALTH),
        onHealthChanged: () => () => undefined,
        failover: () => Promise.resolve({ ok: false, newPrimary: 'A' as const }),
      },
      /*
      `R-066` — the status bar now carries the sign-in state, so a stub that claims to be a
      bridge has to answer for it. `off` is what this stub means: these specs are about the
      LINK and the servers, and a console that does not authenticate is the state in which
      every assertion below was written.

      ⚠ Added rather than defended against in `useAuthSession`. A hook that read an absent
      `auth` member as "off" would also read a PRODUCTION bridge missing it as "off" — and
      `B-153`'s doctrine is that a bridge which cannot answer is the LOUDEST match, never a
      quiet default.
    */
      auth: {
        state: () => ({ kind: 'off' as const }),
        onStateChanged: () => () => undefined,
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
      // The bar's control lost its ellipsis (MODAL-CHROME-10 A §A2); scoped to the bar, so
      // the dialog's own 'Lock' confirm cannot be picked up instead.
      (b.textContent ?? '').includes('Lock'),
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
      /*
        ⚠ `INSPECTOR-DELTA` — was `aria-label="Apply position"`, and that button no longer
        exists anywhere. Left as-is this entry would have become VACUOUS: an absence test for
        a string the product does not contain passes against every possible regression. The
        section's own landmark takes its place — it is still the thing that must be in the
        Inspector and never in Station setup.
      */
      'aria-label="On-air position"',
    );

    stationSetupStub();
    const setup = await renderStationSetup();
    expect(setup.querySelector('[aria-label="On-air position"]')).toBeNull();
    expect(setup.textContent).not.toMatch(/On-air position|Swap source|Plate audio/);
    expect(stationSetupSource()).not.toMatch(/\b(swapLiveSource|setPlateVolumes?|setPosition)\(/);
    expect(stationSetupSource()).not.toMatch(
      /from '.*\/(PositionPicker|LivePlateAudioDialog|LiveSourceSwapDialog)\.js'/,
    );
  });

  it('5. plate→source assignments stay in the Inspector — Station setup never binds a plate (§6)', async () => {
    /*
      Where they live today — `SOURCE-DEFAULTS-20` moved the editor out of the panel and into
      a dialog the Inspector's section head opens. The CLAIM is unchanged and is what this
      case is about: the binding lives on the INSPECTOR side of the product, never in Station
      setup. Only the file that holds it moved.
    */
    expect(read('features', 'inspector', 'TemplateDefaultsDialog.tsx')).toContain(
      'Default source for',
    );
    expect(read('features', 'inspector', 'TemplateDefaultsDialog.tsx')).toContain(
      'commitSourceAssignments',
    );

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

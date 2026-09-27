// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandBuilder } from '@cg/caspar-bridge';
import type { SourceCatalog, SourceProducer } from '@cg/shared-ipc';
import { StationSetupDialog } from '../src/renderer/features/stationSetup/StationSetupDialog.js';
import { stationSetupStub } from './support/stationSetup.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * C-027's HONESTY half — the console must not describe a wire the bridge does not send.
 *
 * 🔴 **THIS TEST IS DELIBERATELY TWO-AXIS, AND THE SECOND AXIS IS THE POINT.** The defect it pins
 * was two spellings of one fact in two packages that drifted apart: the console rendered
 * `DECKLINK DEVICE 1 + KEY 2` while the bridge emitted `DECKLINK DEVICE 1`. So every case asserts
 * the SURFACE and the WIRE for the same `SourceProducer`, and the wire half calls the REAL
 * `CommandBuilder` the bridge uses.
 *
 * ⚠ `PLAYOUT-SOURCES-01` REWROTE THE SURFACE HALF, deliberately. The catalogue editor went (§1.F),
 * and with it the dialog whose per-kind address parts this used to read. Station setup now lists
 * the Playout's inputs read-only and names a DeckLink by its KIND alone (`SDI`, §2.C) — no device,
 * no key, no address of any kind — so the surface can no longer describe a signal path at all,
 * which is the strongest form of the claim this file makes.
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
  clearPortals();
  __resetSourcesForTest();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function renderSources(catalog: SourceCatalog): Promise<HTMLElement> {
  stationSetupStub({ catalog });
  // The catalogue is a module store `App` initialises; the dialog alone reads it.
  __resetSourcesForTest();
  initSources(window.cg);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(StationSetupDialog, {
          open: true,
          section: 'sources',
          onClose: () => undefined,
        }),
      ),
    );
    await Promise.resolve();
    await Promise.resolve();
  });
  await settle();
  const dialog = openDialog();
  if (dialog === null) throw new Error('Station setup did not open');
  return dialog;
}

/** THE WIRE: the real builder the bridge uses, not a second spelling of it. */
function wire(producer: SourceProducer): string {
  return new CommandBuilder().sourceArgument(producer);
}

const decklinkInput = (producer: SourceProducer): SourceCatalog => ({
  sources: [{ id: 'in-sdi-a', name: 'Studio A', origin: 'input', producer }],
});

describe('C-027 — a stored `keyDevice` never reaches the wire, and the console never describes one', () => {
  it('Station setup names a DeckLink input by its KIND alone, and the wire agrees it sends the fill', async () => {
    const configured: SourceProducer = { kind: 'decklink', device: 1, keyDevice: 2 };
    const dialog = await renderSources(decklinkInput(configured));
    const row = dialog.querySelector('[data-source-input]');
    // Positive control: the row IS rendered, with its name and its kind.
    expect(row?.textContent).toContain('Studio A');
    expect(row?.querySelector('[data-source-kind]')?.textContent).toBe('SDI');
    // AXIS 1 — no device, no key, no signal path on the operator surface.
    for (const said of ['DECKLINK', 'Device', 'KEY', 'Key device', '+ KEY']) {
      expect(row?.textContent, said).not.toContain(said);
    }
    // AXIS 2 — the wire, for that same value: the fill alone.
    expect(wire(configured)).toBe('DECKLINK DEVICE 1');
    expect(wire(configured)).not.toContain('2');
  });

  it('POSITIVE CONTROL: with no `keyDevice`, the row and the wire are the same', async () => {
    const plain: SourceProducer = { kind: 'decklink', device: 1 };
    const dialog = await renderSources(decklinkInput(plain));
    expect(dialog.querySelector('[data-source-kind]')?.textContent).toBe('SDI');
    expect(wire(plain)).toBe('DECKLINK DEVICE 1');
  });

  it('the two axes agree across a range of device numbers, key set or not', () => {
    // No DOM here — this is the pure contract half, cheap enough to run wide, including the
    // persistent-ID-sized value the plant's card reports.
    for (const device of [1, 3, 23487013]) {
      for (const keyDevice of [undefined, 2, 4]) {
        const producer: SourceProducer =
          keyDevice === undefined
            ? { kind: 'decklink', device }
            : { kind: 'decklink', device, keyDevice };
        expect(wire(producer)).toBe(`DECKLINK DEVICE ${String(device)}`);
      }
    }
  });
});

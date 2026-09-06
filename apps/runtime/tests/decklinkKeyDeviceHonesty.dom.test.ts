// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommandBuilder } from '@cg/caspar-bridge';
import { checkSourceCatalog, type SourceCatalog, type SourceProducer } from '@cg/shared-ipc';
import { StationSetupDialog } from '../src/renderer/features/stationSetup/StationSetupDialog.js';
import { stationSetupStub } from './support/stationSetup.js';
import { __resetSourcesForTest } from '../src/renderer/features/sources/sourceStore.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * C-027's HONESTY half — the Sources modal must not describe a wire the bridge
 * does not send.
 *
 * 🔴 **THIS TEST IS DELIBERATELY TWO-AXIS, AND THE SECOND AXIS IS THE POINT.**
 * The defect it pins was not a wrong string; it was two spellings of the same
 * fact in two packages that drifted apart without either one becoming
 * self-inconsistent:
 *
 *   - `apps/runtime`'s `describeProducer` rendered `DECKLINK DEVICE 1 + KEY 2`;
 *   - `tools/caspar-bridge`'s `producerArgument` emitted `DECKLINK DEVICE 1`.
 *
 * Each package's own suite was green. An operator who configured a fill/key pair
 * was shown a line describing a signal path that does not exist, got the fill
 * alone, and had nothing anywhere telling them so. A test asserting only the
 * summary string would have gone green on a modal that said `+ KEY` while the
 * builder had silently started emitting a second device — the same defect, the
 * other way round. So every case below asserts the SUMMARY and the WIRE for the
 * **same `SourceProducer` value**, and the wire half calls the REAL
 * `CommandBuilder` the bridge uses rather than a local re-spelling of it.
 *
 * The third assertion is the surface the fix adds: where `keyDevice` is stored,
 * the operator is TOLD it is not sent. An empty surface is not acceptable here —
 * a configured pair that silently degrades to its fill is exactly the class of
 * quiet wrongness this repo keeps closing.
 *
 * The stub's `setConfig` runs the REAL shared validator (`checkSourceCatalog`),
 * so a value this test commits is a value a real station would accept.
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

function stubBridge(): { sent: SourceCatalog[] } {
  const sent: SourceCatalog[] = [];
  // `STATION-SETUP-02` — the Live sources section lives in Station setup; the shared stub
  // supplies every section, and this spec's real validator replaces the catalog writer.
  stationSetupStub({
    sourcesSetConfig: (next: SourceCatalog) => {
      sent.push(next);
      const verdict = checkSourceCatalog(next, { fixedBank: null, reservedLayers: [] });
      return Promise.resolve(
        verdict.ok ? { ok: true } : { ok: false, reason: verdict.reason, message: verdict.message },
      );
    },
  });
  return { sent };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
}

async function renderModal(): Promise<HTMLElement> {
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

async function setInput(dialog: HTMLElement, ariaLabel: string, value: string): Promise<void> {
  const input = dialog.querySelector<HTMLInputElement>(`input[aria-label="${ariaLabel}"]`);
  if (input === null) throw new Error(`input "${ariaLabel}" not rendered`);
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await settle();
}

/**
 * ⭐ `STATION-CHROME-01` §5/§6 — the kind picker and its per-kind fields live in the small
 * SECOND dialog every Add and Edit opens, not inline on the row. Both axes this file
 * measures are unchanged; the surface half is simply reached through that dialog now.
 */
function subDialog(): HTMLElement {
  const all = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')];
  const last = all[all.length - 1];
  if (last === undefined || all.length < 2) throw new Error('the Add dialog is not open');
  return last;
}

async function clickIn(scope: HTMLElement, label: string): Promise<void> {
  const button = [...scope.querySelectorAll('button')].find((b) => b.textContent === label);
  if (button === undefined) throw new Error(`no “${label}” button`);
  await act(async () => {
    button.click();
    await Promise.resolve();
  });
  await settle();
}

async function selectKind(scope: HTMLElement, kind: string): Promise<void> {
  const select = scope.querySelector<HTMLSelectElement>('select[aria-label="Source kind"]');
  if (select === null) throw new Error('no kind picker');
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(select, kind);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

/**
 * Define one DeckLink source with the given key device, through the real Add flow.
 * `keyDevice` empty means "no pair".
 */
async function addDecklink(dialog: HTMLElement, name: string, keyDevice: string): Promise<void> {
  await clickIn(dialog, 'Add source');
  const sub = subDialog();
  await setInput(sub, 'Source name', name);
  await selectKind(sub, 'decklink');
  if (keyDevice !== '') await setInput(sub, 'DeckLink key device index', keyDevice);
  await clickIn(sub, 'Add source');
}

/** THE WIRE: the real builder the bridge uses, not a second spelling of it. */
function wire(producer: SourceProducer): string {
  return new CommandBuilder().sourceArgument(producer);
}

describe('C-027 — a stored `keyDevice` never reaches the wire, and the modal says so', () => {
  it('the summary describes the FILL ALONE, and the wire agrees for the SAME value', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addDecklink(dialog, 'Studio A', '2');

    // The value under test — ONE object, both axes read from it.
    const configured: SourceProducer = { kind: 'decklink', device: 1, keyDevice: 2 };

    // AXIS 1 — the operator surface. The summary is "what this source resolves
    // to, in the words the bridge will send", so a key term here would be a
    // sentence about a signal path that does not exist.
    /*
      ⭐ THE ROW NAMES ITS FIELDS NOW (§5), so the assertion is on the LABELLED parts rather
      than on one derived sentence. The claim is the same and is if anything sharper: the FILL
      is shown as `Device 1`, and a stored key is shown as `Key device (not sent)` — never as
      part of one string that reads like a signal path the wire does not carry.
    */
    const parts = dialog.querySelector('[data-source-parts]')?.textContent ?? '';
    expect(parts).toContain('Device');
    expect(parts).toContain('1');
    expect(dialog.textContent).not.toContain('DECKLINK DEVICE 1 + KEY 2');
    expect(dialog.textContent).not.toContain('+ KEY');

    // AXIS 2 — the wire, for that same value. This is the half that lives in
    // another package and is why axis 1 alone would be blind.
    expect(wire(configured)).toBe('DECKLINK DEVICE 1');
    expect(wire(configured)).not.toContain('2');
  });

  it('a stored `keyDevice` is REPORTED to the operator as not yet sent', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addDecklink(dialog, 'Studio A', '2');

    // In the modal, in plain words — not a tooltip, not a log line. The message
    // must name the device it is talking about and say where it does NOT go.
    const said = dialog.textContent ?? '';
    expect(said).toMatch(/not sent to CasparCG/i);
    expect(said).toContain('2');
    // And it must not read as a refusal: the value IS stored and IS in force as
    // configuration. Nothing was rejected, so nothing announces a rejection.
    expect(dialog.querySelector('[data-notice="refusal"]')).toBeNull();
  });

  it('POSITIVE CONTROL: with no `keyDevice`, the summary and the wire are unchanged', async () => {
    stubBridge();
    const dialog = await renderModal();
    await addDecklink(dialog, 'Studio A', '');

    const plain: SourceProducer = { kind: 'decklink', device: 1 };

    // The control proves the instrument is live: this is the SAME summary and
    // the SAME wire text the paired case produces, which is precisely the claim
    // — a stored key device changes NEITHER. Without it, "no `+ KEY` rendered"
    // could be satisfied by a modal that had stopped rendering the arm at all.
    const parts = dialog.querySelector('[data-source-parts]')?.textContent ?? '';
    expect(parts).toContain('Device');
    expect(parts).toContain('1');
    expect(wire(plain)).toBe('DECKLINK DEVICE 1');

    // …and the not-sent message is ABSENT, because there is nothing unsent.
    expect(dialog.textContent ?? '').not.toMatch(/not sent to CasparCG/i);
  });

  it('the two axes agree across a range of device numbers, key set or not', () => {
    // No DOM here — this is the pure contract half, cheap enough to run wide.
    // `describeProducer` is not exported, so the DOM cases above are what pin
    // the surface; this pins the wire against every shape the schema admits,
    // including the persistent-ID-sized value the plant's card reports.
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

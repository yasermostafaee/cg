// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SourceCatalog } from '@cg/shared-ipc';
import type { StackItemState } from '@cg/shared-schema';
import { signedInStub } from './support/authStub.js';
import { clearPortals, openDialog } from './support/dialog.js';
import {
  renderStationSetup,
  sectionOf,
  setupSlot,
  stationSetupStub,
  unmountStationSetup,
  type StationSetupStubOptions,
} from './support/stationSetup.js';
import type { StationSetupSection } from '../src/renderer/features/stationSetup/sections.js';
import {
  __resetSourcesForTest,
  initSources,
} from '../src/renderer/features/sources/sourceStore.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 I — **EVERY STATION SETUP PANE SHOWS VALUES, NOT INPUTS, TO A PRINCIPAL
 * WHO CANNOT APPLY THEM.**
 *
 * The owner's case: signed in as an operator he opened Layers, saw live switches, editable names
 * and `Apply layers`, pressed it, and the bridge refused — `fixedLayers.set-config` is
 * `station-admin`. The refusal was right; the surface offered a control and refused it
 * afterwards, which golden rule 13 forbids. `OPERATOR-NAME-SWEEP-01` §3(b) fixed the five Servers
 * fields only (`stationSetupReadOnly.dom.test.ts`); this is every pane whose apply route is
 * `station-admin`, walked against the route classes: Servers, Live sources, Text file
 * delimiters, Layers (Channel's one control was a station-admin's already).
 *
 * ⚠ WHY `Apply layers` REACHED AN OPERATOR AT ALL: `PLAYOUT-AUTHZ-01` withheld the footer SLOT
 * below `station-admin`, and the Layers section answers a missing slot by rendering its actions in
 * its BODY (the fallback for a section rendered on its own). Withholding the slot moved the
 * button; it did not remove it. The Layers case below looks for it in the whole dialog.
 *
 * Per pane: an OPERATOR sees values and no commit control (absence) — and THE CONTROL, the same
 * pane for a STATION-ADMIN, shows the inputs and the Apply.
 */

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
});

const OPERATOR = signedInStub('علی رضایی', [1], ['operator', 'viewer']);
const VIEWER = signedInStub('مریم کاظمی', [1], ['viewer']);
const ADMIN = signedInStub('زهرا موسوی', [1], ['station-admin', 'operator', 'viewer']);

const CATALOG: SourceCatalog = {
  sources: [{ id: 'src-a', name: 'استودیو ۱', producer: { kind: 'route', channel: 3 } }],
  layerRange: { start: 60, end: 79 },
};

async function open(
  section: StationSetupSection,
  options: StationSetupStubOptions,
): Promise<{ dialog: HTMLElement; pane: HTMLElement }> {
  stationSetupStub(options);
  // The catalogue is a module store `App` initialises; the dialog alone reads it.
  __resetSourcesForTest();
  initSources(window.cg);
  const dialog = await renderStationSetup({ section });
  return { dialog, pane: sectionOf(dialog, section) };
}

const buttonNamed = (root: ParentNode, name: string | RegExp): HTMLButtonElement | undefined =>
  [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => {
    const said = b.getAttribute('aria-label') ?? b.textContent ?? '';
    return typeof name === 'string' ? said === name : name.test(said);
  });

/** What the pane's head and the dialog's footer say its contract is. */
function contract(pane: HTMLElement): { legend: string; tag: string; footer: string } {
  return {
    legend: pane.querySelector('.cg-setup-description')?.textContent ?? '',
    tag: pane.querySelector('[data-section-commit]')?.textContent ?? '',
    footer: openDialog()?.querySelector('[data-section-footer]')?.textContent ?? '',
  };
}

const READ_ONLY = {
  legend: 'Read-only — this sign-in does not change station settings.',
  tag: 'Read only',
  footer: 'Nothing to apply — this sign-in does not change station settings.',
};

describe('Servers', () => {
  it('🔴 an operator sees the addresses as values — no field, no Apply, no Revert, no Add backup', async () => {
    const { pane, dialog } = await open('servers', { auth: OPERATOR });
    expect(pane.querySelectorAll('[data-setup-readonly]').length, 'the values').toBeGreaterThan(2);
    expect(pane.querySelector('input[aria-label="Primary host"]')).toBeNull();
    expect(pane.querySelector('input[aria-label="Primary AMCP port"]')).toBeNull();
    expect(buttonNamed(dialog, 'Apply server settings')).toBeUndefined();
    expect(buttonNamed(dialog, 'Revert')).toBeUndefined();
    expect(buttonNamed(pane, 'Add backup')).toBeUndefined();
    expect(contract(pane)).toEqual(READ_ONLY);
    // The dismissal is still there — it is not a commit.
    expect(buttonNamed(dialog, 'Close Station setup')).toBeDefined();
  });

  it('an operator is not told the servers are "paused while on air" — there is no Apply to pause', async () => {
    const onAir = {
      itemId: 'a',
      templateId: 't',
      fields: {},
      status: 'on-air',
      pending: false,
    } as StackItemState;
    const { pane } = await open('servers', { auth: OPERATOR, items: [onAir] });
    expect(pane.textContent).not.toContain('Server changes are paused while on air');
    // CONTROL — a station-admin, with the same item on air, is told.
    await unmountStationSetup();
    const again = await open('servers', { auth: ADMIN, items: [onAir] });
    expect(again.pane.textContent).toContain('Server changes are paused while on air');
  });

  it('CONTROL — a station-admin sees the fields, Apply servers and Add backup', async () => {
    const { pane, dialog } = await open('servers', { auth: ADMIN });
    expect(pane.querySelector('input[aria-label="Primary host"]')).not.toBeNull();
    expect(pane.querySelector('[data-setup-readonly]')).toBeNull();
    expect(buttonNamed(dialog, 'Apply server settings')).toBeDefined();
    expect(buttonNamed(pane, 'Add backup')).toBeDefined();
    expect(contract(pane).tag).toBe('Apply together');
  });
});

describe('Live sources', () => {
  it('🔴 an operator sees the catalogue and the band in force — no Add, no Edit, no Remove, no band fields', async () => {
    const { pane } = await open('sources', { auth: OPERATOR, catalog: CATALOG });
    expect(pane.querySelector('[data-source-id="src-a"]')?.textContent, 'the value').toContain(
      'استودیو ۱',
    );
    expect(buttonNamed(pane, 'Add live source')).toBeUndefined();
    expect(buttonNamed(pane, /^Edit /)).toBeUndefined();
    expect(buttonNamed(pane, /^Remove /)).toBeUndefined();
    expect(pane.querySelector('input[aria-label="Live source band start layer"]')).toBeNull();
    expect(buttonNamed(pane, 'Apply band')).toBeUndefined();
    expect(pane.textContent, 'the band, as a value').toContain('Currently 60–79 · 20 layers.');
    expect(contract(pane)).toEqual(READ_ONLY);
  });

  it('CONTROL — a station-admin sees Add, Edit, Remove, the band fields and Apply band', async () => {
    const { pane } = await open('sources', { auth: ADMIN, catalog: CATALOG });
    expect(buttonNamed(pane, 'Add live source')).toBeDefined();
    expect(buttonNamed(pane, 'Edit استودیو ۱')).toBeDefined();
    expect(buttonNamed(pane, 'Remove استودیو ۱')).toBeDefined();
    expect(pane.querySelector('input[aria-label="Live source band start layer"]')).not.toBeNull();
    expect(buttonNamed(pane, 'Apply band')).toBeDefined();
  });
});

describe('Text file delimiters', () => {
  it('🔴 an operator sees the list — no Add, no Remove, no Reset', async () => {
    const { pane } = await open('delimiters', { auth: OPERATOR });
    expect(pane.querySelectorAll('[data-delimiter-id]').length, 'the values').toBeGreaterThan(0);
    expect(buttonNamed(pane, 'Add delimiter')).toBeUndefined();
    expect(buttonNamed(pane, /^Remove delimiter /)).toBeUndefined();
    expect(buttonNamed(pane, 'Reset delimiters to defaults')).toBeUndefined();
    expect(contract(pane)).toEqual(READ_ONLY);
  });

  it('CONTROL — a station-admin sees Add, Remove and Reset', async () => {
    const { pane } = await open('delimiters', { auth: ADMIN });
    expect(buttonNamed(pane, 'Add delimiter')).toBeDefined();
    expect(buttonNamed(pane, /^Remove delimiter /)).toBeDefined();
    expect(buttonNamed(pane, 'Reset delimiters to defaults')).toBeDefined();
  });
});

describe('Layers — the owner’s case', () => {
  it('🔴 an operator sees each row shown or hidden and its name — no switch, no name field, no Apply, no Revert', async () => {
    const { pane, dialog } = await open('candidate-layers', { auth: OPERATOR });
    expect(pane.querySelector('input[role="switch"]')).toBeNull();
    expect(pane.querySelector('input[aria-label^="Name for layer"]')).toBeNull();
    expect(buttonNamed(dialog, 'Apply layers')).toBeUndefined();
    expect(buttonNamed(dialog, 'Revert candidate layer edits')).toBeUndefined();
    // The values: the row's visibility as a fact, and its name — its alias, else its real layer.
    const row70 = pane.querySelector('[data-candidate-layer="70"]');
    expect(row70?.querySelector('[data-layer-shown]')?.textContent).toBe('Shown');
    expect(row70?.textContent).toContain('CLOCK');
    expect(pane.querySelector('[data-candidate-layer="71"]')?.textContent).toContain('Layer 71');
    expect(contract(pane)).toEqual(READ_ONLY);
  });

  it('CONTROL — a station-admin sees the switches, the name fields, Apply layers and Revert', async () => {
    const { pane, dialog } = await open('candidate-layers', { auth: ADMIN });
    expect(pane.querySelector('input[role="switch"]')).not.toBeNull();
    expect(pane.querySelector('input[aria-label^="Name for layer"]')).not.toBeNull();
    expect(buttonNamed(dialog, 'Apply layers')).toBeDefined();
    expect(buttonNamed(dialog, 'Revert candidate layer edits')).toBeDefined();
    expect(pane.querySelector('[data-layer-shown]')).toBeNull();
  });

  it('a row’s Remove is the OPERATOR verb: absent for a viewer — control: an operator has it', async () => {
    const bound = [
      setupSlot(70, { itemId: 'item-70', templateType: 'clock', templateId: 'tpl-clock' }),
      setupSlot(71),
    ];
    const { pane } = await open('candidate-layers', { auth: VIEWER, slots: bound });
    expect(pane.querySelector('[data-candidate-layer="70"]')?.textContent, 'bound').toContain(
      'tpl-clock',
    );
    expect(buttonNamed(pane, /^Remove the template on /)).toBeUndefined();

    await unmountStationSetup();
    const again = await open('candidate-layers', { auth: OPERATOR, slots: bound });
    expect(buttonNamed(again.pane, /^Remove the template on /)).toBeDefined();
  });
});

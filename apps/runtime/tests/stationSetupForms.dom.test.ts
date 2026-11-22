// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { signedInStub } from './support/authStub.js';
import { clearPortals } from './support/dialog.js';
import {
  renderStationSetup,
  setSetupInput,
  stationSetupStub,
  unmountStationSetup,
} from './support/stationSetup.js';

beforeEach(() => vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true));

afterEach(async () => {
  await unmountStationSetup();
  clearPortals();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('makes visible server labels target their controls without changing the accessible names', async () => {
  stationSetupStub();
  const dialog = await renderStationSetup({ section: 'servers' });
  for (const [name, visibleLabel] of [
    ['Primary host', 'Host'],
    ['Primary AMCP port', 'AMCP port'],
    ['Primary OSC port', 'OSC port'],
    ['Graphics host', 'Host'],
    ['Graphics port', 'Port'],
    ['Redundancy strategy', 'Strategy'],
    ['Auto-failover enabled', 'Automatic failover'],
  ]) {
    const control = dialog.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[aria-label="${name}"]`,
    );
    expect(control, name).not.toBeNull();
    expect(control?.labels?.item(0)?.textContent?.trim(), name).toBe(visibleLabel);
    expect(control?.labels?.item(0)?.control, name).toBe(control);
  }
  const failover = dialog.querySelector<HTMLInputElement>('[aria-label="Auto-failover enabled"]');
  expect(failover?.checked).toBe(true);
  await act(async () => failover?.labels?.item(0)?.click());
  expect(failover?.checked).toBe(false);

  const host = dialog.querySelector<HTMLInputElement>('[aria-label="Primary host"]');
  await setSetupInput(dialog, 'Primary host', 'http://192.0.2.11/path');
  expect(host?.getAttribute('aria-invalid')).toBe('true');
  const error = document.getElementById(host?.getAttribute('aria-describedby') ?? '');
  expect(error?.textContent).toContain('not a URL');
  await setSetupInput(dialog, 'Primary host', '192.0.2.11');
  expect(host?.hasAttribute('aria-invalid')).toBe(false);
  expect(host?.hasAttribute('aria-describedby')).toBe(false);
});

it('keeps the restore instruction associated when its validation error appears and clears', async () => {
  stationSetupStub({ auth: signedInStub('Admin', [1], ['station-admin', 'operator', 'viewer']) });
  const dialog = await renderStationSetup({ section: 'servers' });
  const restore = dialog.querySelector<HTMLInputElement>('[aria-label="Restore window (seconds)"]');
  const describedElements = (): HTMLElement[] =>
    (restore?.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .map((id) => {
        const element = document.getElementById(id);
        if (element === null) throw new Error(`Missing field description ${id}`);
        return element;
      });
  expect(restore?.labels?.item(0)?.control).toBe(restore);
  expect(describedElements()).toHaveLength(1);
  expect(describedElements()[0]?.textContent).toContain('Enter 0 to turn it off.');

  await setSetupInput(dialog, 'Restore window (seconds)', '31');
  expect(restore?.getAttribute('aria-invalid')).toBe('true');
  expect(describedElements()).toHaveLength(2);
  expect(describedElements()[0]?.textContent).toContain('Enter 0 to turn it off.');
  expect(describedElements()[1]?.hasAttribute('data-field-error')).toBe(true);

  await setSetupInput(dialog, 'Restore window (seconds)', '0');
  expect(restore?.hasAttribute('aria-invalid')).toBe(false);
  expect(describedElements()).toHaveLength(1);
  expect(describedElements()[0]?.textContent).toContain('Enter 0 to turn it off.');
  expect(dialog.querySelector('[data-setup-field="Primary-host"] label')).toBeNull();
});

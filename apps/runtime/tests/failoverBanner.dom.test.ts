// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { ConnectionHealth } from '@cg/shared-ipc';
import { FailoverBanner } from '../src/renderer/features/connections/FailoverBanner.js';
import { colors, cssVars } from '../src/renderer/theme.js';

/**
 * `RUNTIME-REDESIGN-01` Phase 9 — deletion guard item 9, the failover banner.
 *
 * 🔴 NO TEST EXISTED, and the half most easily lost was the SUPPRESSION: in test mode there
 * are no real servers, the mock honestly reports them `disconnected`, and a banner shouting
 * "PRIMARY A unhealthy" about hardware that does not exist is a fresh implication that a real
 * server is out there, broken. The TEST MODE banner is the truth in that mode and supersedes
 * it (`R-006`). That gate used to live in `App.tsx` as `link !== 'offline-mock' && …`, where no
 * component test could reach it; Phase 9 moved it INTO the component, which is what lets this
 * file assert it.
 *
 * `B-172` — the banner used to be ONE red slab (`position: fixed`, hard-coded hex, `alert`)
 * for three different things. It is now an in-flow strip in the banner region, and its tone is
 * the SITUATION's, by token identity:
 *
 *   | situation                                  | tone     | role     |
 *   | ------------------------------------------ | -------- | -------- |
 *   | a MANUAL failover that succeeded           | notice   | status   |
 *   | an AUTOMATIC failover — worth noticing     | caution  | alert    |
 *   | the primary is degraded / disconnected     | alarm    | alert    |
 *
 * Dismissal is keyed by the event's timestamp, so a NEW failover re-shows a dismissed banner
 * — the air-critical half of the old contract, kept.
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
});

async function mount(
  health: ConnectionHealth | null,
  link: 'live' | 'offline-mock' | 'disconnected' = 'live',
): Promise<{ el: HTMLElement; rerender: (next: ConnectionHealth | null) => Promise<void> }> {
  const stub = {
    link: {
      status: () => link,
      onStatusChanged: () => () => undefined,
      resyncing: () => false,
      onResyncingChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  const render = async (h: ConnectionHealth | null): Promise<void> => {
    await act(async () => {
      r.render(createElement(StrictMode, null, createElement(FailoverBanner, { health: h })));
    });
  };
  await render(health);
  return { el: container, rerender: render };
}

const strip = (el: HTMLElement): HTMLElement | null => el.querySelector('[data-failover-banner]');

/** A token in the form the DOM reads it back (`#172736` → `rgb(23, 39, 54)`). */
function asRendered(token: string): string {
  const probe = document.createElement('span');
  probe.style.color = token;
  return probe.style.color;
}

function fillOf(s: HTMLElement | null): string {
  const fill = (s as HTMLElement).style.backgroundColor;
  expect(fill).not.toBe('');
  return fill;
}

const healthy = (label: 'A' | 'B' = 'A'): ConnectionHealth => ({
  primary: { label, state: 'healthy', amcpAxisOk: true },
  backup: { label: label === 'A' ? 'B' : 'A', state: 'healthy', amcpAxisOk: true },
  currentPrimary: label,
  strategy: 'mirror-sync',
});

const AT = '2026-09-08T12:00:00.000Z';

describe('guard item 9 — the failover banner renders under its conditions, and is suppressed in test mode', () => {
  it('renders NOTHING for a healthy pair with no failover since boot', async () => {
    const { el } = await mount(healthy());
    expect(strip(el)).toBeNull();
  });

  it('renders NOTHING before any health reading has arrived', async () => {
    const { el } = await mount(null);
    expect(strip(el)).toBeNull();
  });

  it('a MANUAL failover that succeeded is INFORMATION: a notice-toned status, naming the new primary', async () => {
    const { el } = await mount({
      ...healthy('B'),
      lastFailover: { at: AT, reason: 'manual', from: 'A', to: 'B' },
    });
    const s = strip(el);
    expect(s, 'the banner did not render for a completed failover').not.toBeNull();
    expect(s?.getAttribute('role')).toBe('status');
    expect(s?.dataset['tone']).toBe('notice');
    expect(s?.textContent).toContain('Manual failover');
    expect(s?.textContent).toContain('A');
    expect(s?.textContent).toContain('B');
    expect(s?.textContent).toContain('primary: B');
    // Not the alarm palette — that is B-172's whole complaint.
    const fill = fillOf(s);
    expect(cssVars['--r-notice-neutral-bg']).toBeTruthy();
    expect(fill).toBe(asRendered(cssVars['--r-notice-neutral-bg']));
    expect(fill).not.toBe(asRendered(colors.alarmFill));
  });

  it('an AUTOMATIC failover is worth noticing: caution-toned, and announced', async () => {
    const { el } = await mount({
      ...healthy('B'),
      lastFailover: { at: AT, reason: 'osc-silence', from: 'A', to: 'B' },
    });
    const s = strip(el);
    expect(s).not.toBeNull();
    expect(s?.getAttribute('role')).toBe('alert');
    expect(s?.dataset['tone']).toBe('caution');
    expect(s?.textContent).toContain('Auto-failover');
    expect(cssVars['--r-caution-bg']).toBeTruthy();
    expect(fillOf(s)).toBe(asRendered(cssVars['--r-caution-bg']));
  });

  it('an UNHEALTHY primary is the alarm: error-toned, announced, and it cannot be dismissed', async () => {
    const { el } = await mount({
      ...healthy(),
      primary: { label: 'A', state: 'degraded', amcpAxisOk: true },
    });
    const s = strip(el);
    expect(s).not.toBeNull();
    expect(s?.getAttribute('role')).toBe('alert');
    expect(s?.dataset['tone']).toBe('alarm');
    expect(s?.textContent).toContain('PRIMARY A unhealthy');
    expect(s?.textContent).toContain('degraded');
    expect(colors.alarmFill).toBeTruthy();
    expect(fillOf(s)).toBe(asRendered(colors.alarmFill));
    // Broken state is never silently hidden — there is no Dismiss for it.
    expect(el.querySelector('button[aria-label="Dismiss failover banner"]')).toBeNull();
  });

  it('is a STRIP in the flow, not the fixed slab B-172 records', async () => {
    const { el } = await mount({
      ...healthy('B'),
      lastFailover: { at: AT, reason: 'manual', from: 'A', to: 'B' },
    });
    const s = strip(el) as HTMLElement;
    expect(s.style.position).not.toBe('fixed');
    expect(s.style.flexShrink).toBe('0');
  });

  it('DISMISS hides the event, and a NEW event (a different timestamp) shows again', async () => {
    const { el, rerender } = await mount({
      ...healthy('B'),
      lastFailover: { at: AT, reason: 'manual', from: 'A', to: 'B' },
    });
    const dismiss = el.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss failover banner"]',
    );
    expect(dismiss).not.toBeNull();
    await act(async () => {
      dismiss?.click();
    });
    expect(strip(el)).toBeNull();
    await rerender({
      ...healthy('A'),
      lastFailover: { at: '2026-09-08T12:05:00.000Z', reason: 'manual', from: 'B', to: 'A' },
    });
    expect(strip(el), 'a new failover must re-show a dismissed banner').not.toBeNull();
  });

  it('🔴 THE SUPPRESSION — in test mode (offline-mock) it renders NOTHING, whatever the health says', async () => {
    const { el } = await mount(
      {
        ...healthy(),
        primary: { label: 'A', state: 'disconnected', amcpAxisOk: false },
        lastFailover: { at: AT, reason: 'amcp-ping-fail', from: 'A', to: 'B' },
      },
      'offline-mock',
    );
    expect(strip(el)).toBeNull();
  });

  it('the positive control for the suppression: the SAME health on a live link renders', async () => {
    const { el } = await mount(
      {
        ...healthy(),
        primary: { label: 'A', state: 'disconnected', amcpAxisOk: false },
        lastFailover: { at: AT, reason: 'amcp-ping-fail', from: 'A', to: 'B' },
      },
      'live',
    );
    expect(strip(el)).not.toBeNull();
  });
});

// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { LayerRow } from '../src/renderer/features/layers/LayerRow.js';
import { ConnectionBanner } from '../src/renderer/features/status/ConnectionBanner.js';
import { seedHealth } from '../src/platform/seed.js';
import { MockRuntime } from '../src/platform/MockRuntime.js';

/**
 * R-006 — test mode may SIMULATE, but it may not LIE.
 *
 * The live failure: the mock drove the row to the same broadcast-red ON AIR badge a real
 * playout produces, and seeded both servers as HEALTHY — so an amber "OFFLINE (mock)" pill
 * sat beside a green "PRIMARY A HEALTHY" and the reassuring claim won. The operator pressed
 * PLAY and believed a graphic was on air. Nothing was.
 *
 * These pin the three claims that must never be made by a simulation.
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
  vi.restoreAllMocks();
});

function stubLink(status: 'live' | 'disconnected' | 'offline-mock'): void {
  const noopAsync = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });
  const stub = {
    link: { status: () => status, onStatusChanged: () => () => undefined },
    stack: { take: noopAsync, next: noopAsync, stop: noopAsync, out: noopAsync, remove: noopAsync },
    templates: { list: () => Promise.resolve([]), onChanged: () => () => undefined },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

async function render(el: ReturnType<typeof createElement>): Promise<HTMLDivElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(createElement(StrictMode, null, el));
    await Promise.resolve();
  });
  return container;
}

const ON_AIR: StackItemState = {
  itemId: 'item-1',
  templateId: 'tpl-1',
  fields: { title: 'عنوان' },
  status: 'on-air',
  pending: false,
};

const noop = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });

/**
 * R-028 part B — the same claims, now on the LAYER row that replaced StackRow.
 * The badge treatment is precisely what these tests protect, so they moved with
 * it rather than being left behind with the deleted component. (Porting them
 * caught a real regression: the first draft of the new row rendered a raw
 * status label, which would have claimed "ON AIR" in test mode.)
 */
function row(item: StackItemState): ReturnType<typeof createElement> {
  return createElement(LayerRow, {
    slot: {
      channel: 1,
      layer: 70,
      alias: 'CLOCK',
      observed: { kind: 'producer' as const, producer: 'html' },
      binding: { itemId: item.itemId, templateType: 'clock', templateId: item.templateId },
    },
    item,
    template: { templateId: 'tpl-1', templateType: 'clock', fields: [] },
    bankPosition: 1,
    selected: false,
    dirty: false,
    onSelect: () => undefined,
    onUpdate: noop,
  });
}

describe('test mode does not claim real air — R-006', () => {
  it('badges a simulated air-claim as SIM, never the broadcast-red ON AIR', async () => {
    stubLink('offline-mock');
    const el = await render(row(ON_AIR));

    // The row's state CELL replaced the badge pill when the verbs went neutral
    // and colour moved to the state. The claims below are unchanged.
    const state = el.querySelector('[data-row-state]');
    expect(state?.textContent).toContain('SIM ON AIR');
    // The sacred red ROLE is RESERVED for a graphic a real server confirmed.
    expect(state?.getAttribute('data-row-state')).not.toBe('onair');
    expect(el.querySelector('[aria-label="status SIM ON AIR"]')).not.toBeNull();
  });

  it('renders the identical item as real ON AIR when the link is live', async () => {
    stubLink('live');
    const el = await render(row(ON_AIR));

    const state = el.querySelector('[data-row-state]');
    expect(state?.textContent).toContain('ON AIR');
    expect(state?.textContent).not.toContain('SIM');
    expect(state?.getAttribute('data-row-state')).toBe('onair');
  });

  it('shows a loud, persistent TEST MODE alert — not a pill among pills', async () => {
    stubLink('offline-mock');
    const el = await render(createElement(ConnectionBanner));

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.getAttribute('aria-label')).toBe('Test mode');
    expect(alert?.textContent).toContain('NOTHING IS ON AIR');
    expect(alert?.textContent).toContain('No command reaches CasparCG');
  });

  it('shows a loud NOT CONNECTED alert when the bridge is unreachable', async () => {
    stubLink('disconnected');
    const el = await render(createElement(ConnectionBanner));

    const alert = el.querySelector('[role="alert"]');
    expect(alert?.getAttribute('aria-label')).toBe('Bridge disconnected');
    expect(alert?.textContent).toContain('NOTHING CAN REACH AIR');
    // Refused, not queued — the operator must know to reissue.
    expect(alert?.textContent).toContain('refused, not queued');
  });

  it('renders NOTHING when the link is live — no banner IS the signal air is reachable', async () => {
    stubLink('live');
    const el = await render(createElement(ConnectionBanner));

    expect(el.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('the mock never claims a healthy server — R-006', () => {
  it('seedHealth reports no connected server', () => {
    const health = seedHealth('A');

    expect(health.primary.state).not.toBe('healthy');
    expect(health.primary.amcpAxisOk).toBe(false);
    expect(health.backup?.state).not.toBe('healthy');
    expect(health.backup?.amcpAxisOk).toBe(false);
  });

  it('MockRuntime.health() never reports a healthy CasparCG', () => {
    const health = new MockRuntime().health();

    expect(health.primary.state).toBe('disconnected');
    expect(health.backup?.state).toBe('disconnected');
  });
});

// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { StackItemState } from '@cg/shared-schema';
import { StackRow } from '../src/renderer/features/stack/StackRow.js';

/**
 * B-087 — honest ON AIR across a BRIDGE-process death (the outer-link twin of B-086).
 *
 * When the SPA↔bridge WebSocket drops, B-086's `unverified` demotion cannot fire — it is a
 * bridge-side product delivered over `StackStateChanged`, and a dead bridge sends nothing — and
 * the renderer freezes the last stack snapshot (`useBridgeSnapshot` early-returns on
 * `disconnected`). So a frozen on-air row would keep rendering the sacred-red ● ON AIR the wire
 * can no longer back. `StackRow` masks it: while `linkDown && onAir` it feeds the badge the muted
 * `unverified` "WAS ON AIR" B-086 already defines — a display mask only, lifted automatically when
 * the link returns and the authoritative snapshot re-pulls. The tooltip is made link-aware so it
 * names the connection that actually dropped (the bridge here; the CasparCG link for B-086).
 */

let container: HTMLDivElement | null = null;

afterEach(() => {
  container?.remove();
  container = null;
});

function stubLink(status: 'live' | 'disconnected' | 'offline-mock'): void {
  const stub = { link: { status: () => status, onStatusChanged: () => () => undefined } };
  (window as unknown as { cg: typeof stub }).cg = stub;
}

function itemWith(status: StackItemState['status']): StackItemState {
  return {
    itemId: 'item-1',
    templateId: 'tpl-1',
    fields: { title: 'عنوان' },
    status,
    pending: false,
  };
}

const noop = (): Promise<{ accepted: boolean }> => Promise.resolve({ accepted: true });

async function renderBadge(
  status: StackItemState['status'],
  link: 'live' | 'disconnected' | 'offline-mock',
): Promise<{ text: string; className: string; title: string | null }> {
  stubLink(link);
  container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(StackRow, {
          item: itemWith(status),
          selected: false,
          dirty: false,
          onSelect: () => undefined,
          onPlay: noop,
          onUpdate: noop,
          onOut: noop,
          onRemove: noop,
        }),
      ),
    );
  });
  const badge = container.querySelector('.cg-badge');
  const result = {
    text: badge?.textContent ?? '',
    className: badge?.className ?? '',
    title: badge?.getAttribute('title') ?? null,
  };
  await act(async () => {
    root.unmount();
  });
  return result;
}

describe('B-087 — bridge death masks the on-air badge, does not lie', () => {
  it('an ON AIR row on a dead bridge reads muted "WAS ON AIR", never the broadcast red', async () => {
    const badge = await renderBadge('on-air', 'disconnected');
    expect(badge.text).toContain('WAS ON AIR');
    // The sacred red is RESERVED for a graphic the wire can currently confirm.
    expect(badge.className).not.toContain('cg-badge--onair');
    expect(badge.text).not.toContain('SIM');
  });

  it('a PLAYING row on a dead bridge is masked too (B-086 predicate parity)', async () => {
    const badge = await renderBadge('playing', 'disconnected');
    expect(badge.text).toContain('WAS ON AIR');
    expect(badge.className).not.toContain('cg-badge--onair');
  });

  it('renders the identical ON AIR row as real broadcast red while the link is live', async () => {
    const badge = await renderBadge('on-air', 'live');
    expect(badge.text).toContain('ON AIR');
    expect(badge.text).not.toContain('WAS ON AIR');
    expect(badge.className).toContain('cg-badge--onair');
  });

  it('a non-on-air row (loaded) on a dead bridge is untouched — only the confident air-claim is masked', async () => {
    const badge = await renderBadge('loaded', 'disconnected');
    expect(badge.text).toContain('READY');
    expect(badge.text).not.toContain('WAS ON AIR');
  });

  it('an idle row on a dead bridge is untouched', async () => {
    const badge = await renderBadge('idle', 'disconnected');
    expect(badge.text).toContain('IDLE');
    expect(badge.text).not.toContain('WAS ON AIR');
  });
});

describe('B-087 — the tooltip names the link that actually dropped', () => {
  it('a bridge-death mask names the BRIDGE connection', async () => {
    const badge = await renderBadge('on-air', 'disconnected');
    expect(badge.title).toContain('bridge connection');
    expect(badge.title).not.toContain('CasparCG');
  });

  it('a CasparCG-link-loss unverified item on a live bridge names the CasparCG link (B-086 parity)', async () => {
    // B-086 publishes `unverified` while the CasparCG link is down but the SPA↔bridge link is LIVE.
    const badge = await renderBadge('unverified', 'live');
    expect(badge.title).toContain('CasparCG');
    expect(badge.title).not.toContain('bridge connection');
    // Still the muted badge, either way.
    expect(badge.text).toContain('WAS ON AIR');
    expect(badge.className).not.toContain('cg-badge--onair');
  });
});

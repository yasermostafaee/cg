// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import type { FixedLayerBank } from '@cg/shared-ipc';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { fillBridgeStub } from './support/authStub.js';
import { auditPageOf } from './support/auditPage.js';

/**
 * 🔴 `CONSOLE-POLISH-01` (`R-083`) — **THE LOG, A PAGE AT A TIME, AND LIVE.**
 *
 * What jsdom can say: what the dialog ASKS CG Bridge for, that it holds one explicit 25-row page,
 * that Previous/Next use the bridge cursor, and that a row pushed while page 1 is open refreshes the
 * page. Chromium measures the same contract against a real bridge (`audit-paging.spec.ts`).
 */

const BANKS: FixedLayerBank[] = [
  { channel: 1, start: 70, count: 30, low: { start: 50, count: 9 } },
  { channel: 2, start: 70, count: 30, low: { start: 50, count: 9 } },
];

/** Row `n`, newest first by `n` ascending: a take on channel `1 + n % 2`. */
function row(n: number, over: Partial<AuditEntry> = {}): AuditEntry {
  return {
    ts: new Date(Date.parse('2026-10-03T09:00:00.000Z') - n * 1000).toISOString(),
    actor: n % 3 === 0 ? 'سارا' : 'Reza',
    action: 'take',
    itemId: `item-${String(n)}`,
    slot: { channel: 1 + (n % 2), layer: 70, server: 'primary' },
    outcome: 'ok',
    ...over,
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let push: ((entry: AuditEntry) => void) | null = null;

afterEach(async () => {
  if (root !== null) {
    const r = root;
    await act(async () => {
      r.unmount();
    });
  }
  root = null;
  push = null;
  container?.remove();
  container = null;
  clearPortals();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function stubBridge(entries: AuditEntry[]): ReturnType<typeof auditPageOf>['requests'] {
  const { page, count, requests } = auditPageOf(entries, { bank: BANKS });
  const stub = {
    audit: {
      canDownloadLogs: () => false,
      downloadLogs: () => Promise.resolve({ accepted: false }),
      page,
      count,
      onAppended: (handler: (entry: AuditEntry) => void) => {
        push = (entry) => {
          if (!entries.some((held) => held.itemId === entry.itemId && held.ts === entry.ts)) {
            entries.unshift(entry);
          }
          handler(entry);
        };
        return () => {
          push = null;
        };
      },
      health: () =>
        Promise.resolve({
          configured: true,
          path: '/x/audit.ndjson',
          errorCount: 0,
          lastError: null,
        }),
    },
    templates: { list: () => Promise.resolve([]) },
    fixedLayers: { config: () => Promise.resolve(BANKS[0]), banks: () => Promise.resolve(BANKS) },
    stationChannels: {
      list: () =>
        Promise.resolve({
          channels: [
            { channel: 1, named: { id: 'news', name: 'News' }, declared: true, sources: ['bank'] },
            {
              channel: 2,
              named: { id: 'sports', name: 'Sports' },
              declared: true,
              sources: ['bank'],
            },
          ],
        }),
      onChanged: () => () => undefined,
    },
  };
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
  return requests;
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

async function render(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(
      createElement(
        StrictMode,
        null,
        createElement(AuditPanel, { open: true, onClose: () => undefined }),
      ),
    );
  });
  await settle();
}

const dialog = (): HTMLElement => {
  const d = openDialog();
  if (d === null) throw new Error('the audit log did not open');
  return d;
};
const rows = (): HTMLElement[] => [...dialog().querySelectorAll<HTMLElement>('[data-audit-row]')];
const items = (): string[] => rows().map((r) => r.getAttribute('data-audit-item-id') ?? '');
const count = (): string => dialog().querySelector('[data-audit-count]')?.textContent ?? '';
const total = (): string => dialog().querySelector('[data-audit-total]')?.textContent ?? '';

describe('`R-083` — a page from CG Bridge', () => {
  it('🔴 opens on the first 25-row page and Previous/Next use the bridge cursor', async () => {
    const requests = stubBridge(Array.from({ length: 250 }, (_, n) => row(n)));
    await render();
    expect(requests[0]).toEqual({ filter: {}, limit: 25 });
    expect(dialog().querySelector('[data-audit-rows]')?.getAttribute('data-audit-held')).toBe('25');
    expect(count()).toBe('25 events');
    expect(total()).toBe('250 events total');
    expect(rows()).toHaveLength(25);
    expect(items()[0]).toBe('item-0');

    const next = dialog().querySelector<HTMLButtonElement>('[aria-label="Next audit page"]');
    await act(async () => next?.click());
    await settle();
    expect(requests.at(-1)).toMatchObject({ filter: {}, limit: 25 });
    expect(requests.at(-1)?.cursor).toBeDefined();
    expect(dialog().querySelector('[data-audit-page]')?.textContent).toBe('Page 2');
    expect(items()[0]).toBe('item-25');

    const previous = dialog().querySelector<HTMLButtonElement>(
      '[aria-label="Previous audit page"]',
    );
    await act(async () => previous?.click());
    await settle();
    expect(requests.at(-1)).toEqual({ filter: {}, limit: 25 });
    expect(dialog().querySelector('[data-audit-page]')?.textContent).toBe('Page 1');
    expect(items()[0]).toBe('item-0');
  });

  it('the Channel filter is the station’s channels, and it is asked of the bridge', async () => {
    const requests = stubBridge(Array.from({ length: 10 }, (_, n) => row(n)));
    await render();
    const select = dialog().querySelector<HTMLSelectElement>('#audit-channel');
    expect([...(select?.options ?? [])].map((o) => o.textContent)).toEqual([
      'All channels',
      'CH 1 · News',
      'CH 2 · Sports',
    ]);
    await act(async () => {
      if (select === null) return;
      select.value = '2';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(requests.at(-1)?.filter).toEqual({ channel: 2 });
    expect(
      rows().every((r) =>
        r.querySelector('[data-audit-slot]')?.getAttribute('data-audit-slot')?.startsWith('2-'),
      ),
    ).toBe(true);
    expect(rows()).toHaveLength(5);
    expect(total()).toBe('5 events total');
  });

  it('shows the channel name in its own column and the whole row opens details', async () => {
    stubBridge([row(0)]);
    await render();
    expect(dialog().querySelector('[data-audit-head]')?.textContent).toContain('Channel');
    expect(rows()[0]?.querySelector('[data-audit-channel]')?.textContent).toContain('News');
    expect(rows()[0]?.textContent).not.toContain('View details');
    expect(rows()[0]?.matches('button')).toBe(true);
  });
});

describe('`R-083` — a row recorded while the Log is open', () => {
  it('🔴 arrives at the top when it matches; control: one that does not match, or is already held, does not', async () => {
    stubBridge([row(1), row(2)]);
    await render();
    expect(items()).toEqual(['item-1', 'item-2']);

    const fresh = row(0, { itemId: 'item-new', ts: '2026-10-03T09:00:05.000Z' });
    await act(async () => {
      push?.(fresh);
    });
    await settle();
    expect(items()).toEqual(['item-new', 'item-1', 'item-2']);
    expect(count()).toBe('3 events');

    // Already held (a page and a push both carried it): not twice.
    await act(async () => {
      push?.(row(1));
    });
    await settle();
    expect(items()).toEqual(['item-new', 'item-1', 'item-2']);

    // Under a filter it does not pass: not added.
    const result = dialog().querySelector<HTMLSelectElement>('#audit-result');
    await act(async () => {
      if (result === null) return;
      result.value = 'failed';
      result.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(items()).toEqual([]);
    await act(async () => {
      push?.(row(9, { itemId: 'item-ok', ts: '2026-10-03T09:00:09.000Z' }));
    });
    expect(items()).toEqual([]);
    await act(async () => {
      push?.(row(9, { itemId: 'item-failed', outcome: 'failed', ts: '2026-10-03T09:00:10.000Z' }));
    });
    await settle();
    expect(items()).toEqual(['item-failed']);
  });
});

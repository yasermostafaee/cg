// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import { MAX_ACTOR_LENGTH } from '@cg/shared-ipc';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * 🔴 `RUNTIME-REDESIGN-01` — DELETION GUARD ITEM 27: THE AUDIT LOG'S WHO.
 *
 * The approved reference's audit table is `Time · UTC | Action | Item | Result` — it draws NO
 * actor column, no caveat beside one, and no field that writes one. A redesign that ships what
 * is drawn deletes all three at once, and a log that names nobody is `B-143`'s failure with the
 * sign flipped: the system would say something it does not know.
 *
 * The owner's answer (A1, `design.md` §5b): the console-name picker STAYS, made small, BESIDE
 * the actor column in the audit panel — never in Station setup — and the caveat does not move.
 * The caveat already had three green tests; the COLUMN had none, which is what this file adds.
 * Each assertion is the property, not the pixel: what the column is headed, what a row's cell
 * carries, that the field and its caveat are one strip and that strip sits over the table.
 * Geometry ("small") is Playwright's (`library-audit-geometry.spec.ts`); jsdom compares zeros.
 */

const DESK_2: AuditEntry = {
  ts: '2026-09-08T09:15:31.343Z',
  actor: 'desk 2',
  action: 'take',
  itemId: 'item-9e064614-8e46-483a-82fe-0b750598cf88',
  templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
  slot: { channel: 1, layer: 9, server: 'primary' },
  outcome: 'ok',
};
const NOBODY: AuditEntry = {
  ts: '2026-09-08T09:12:21.924Z',
  actor: 'unattributed',
  action: 'import',
  templateId: 'e506e319-6e68-4603-a5f4-290b21616250',
  outcome: 'ok',
};
/** A Persian console name — the actor cell must isolate it as the names are isolated. */
const PERSIAN: AuditEntry = {
  ts: '2026-09-08T09:10:00.000Z',
  actor: 'میز خبر',
  action: 'stop',
  itemId: 'item-335557e4-0000-4000-8000-000000000000',
  slot: { channel: 1, layer: 70, server: 'primary' },
  outcome: 'failed',
  errorCode: 'amcp-404',
};

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
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function stubBridge(entries: AuditEntry[]): {
  recentCalls: { actor?: string; action?: string }[];
  written: string[];
} {
  const recentCalls: { actor?: string; action?: string }[] = [];
  const written: string[] = [];
  let operatorName = 'desk 2';
  const stub = {
    audit: {
      recent: (req: { actor?: string; action?: string }) => {
        recentCalls.push(req);
        const actor = req.actor;
        return Promise.resolve(
          actor === undefined ? entries : entries.filter((e) => e.actor === actor),
        );
      },
      health: () =>
        Promise.resolve({
          configured: true,
          path: '/x/audit.ndjson',
          errorCount: 0,
          lastError: null,
        }),
      operatorName: () => operatorName,
      setOperatorName: (name: string) => {
        operatorName = name;
        written.push(name);
      },
    },
    templates: { list: () => Promise.resolve([]) },
    fixedLayers: { config: () => Promise.resolve(null) },
  };
  (window as unknown as { cg: typeof stub }).cg = stub;
  return { recentCalls, written };
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
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

const dialog = (): HTMLElement => {
  const d = openDialog();
  if (d === null) throw new Error('the audit log did not open');
  return d;
};
const rows = (): HTMLElement[] => [...dialog().querySelectorAll<HTMLElement>('[data-audit-row]')];

async function type(el: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('guard item 27 — the actor COLUMN the reference does not draw', () => {
  it('heads the table with Actor, second, between Time and Action', async () => {
    stubBridge([DESK_2, NOBODY]);
    await render();
    const head = dialog().querySelector('[data-audit-head]');
    expect(head).not.toBeNull();
    const words = [...(head?.querySelectorAll('span') ?? [])].map((s) => s.textContent?.trim());
    expect(words).toEqual(['Time', 'Actor', 'Action', 'Item / detail', 'Outcome']);
    // The header cell is marked so nothing can rename or drop it unnoticed…
    const actorHead = head?.querySelector('[data-audit-actor-head]');
    expect(actorHead?.textContent).toBe('Actor');
    // …and it says, on hover, what the value under it is: a label, not a sign-in.
    expect(actorHead?.getAttribute('title')).toMatch(/not a verified sign-in/);
  });

  it("every row's actor cell carries that record's actor, verbatim, in its own isolate", async () => {
    stubBridge([DESK_2, NOBODY, PERSIAN]);
    await render();
    const cells = rows().map((r) => r.querySelector<HTMLElement>('[data-audit-actor]'));
    expect(cells.map((c) => c?.getAttribute('data-audit-actor'))).toEqual([
      'desk 2',
      'unattributed',
      'میز خبر',
    ]);
    expect(cells.map((c) => c?.textContent)).toEqual(['desk 2', 'unattributed', 'میز خبر']);
    // Golden rule 11 — a console name can be Persian beside this Latin chrome, so the value
    // is a `<bdi>` of its own, exactly as the names column isolates its names.
    for (const cell of cells)
      expect(cell?.querySelector('bdi')?.textContent).toBe(cell?.textContent);
    // The WHO is never composed into the names: the names cell names the row and the
    // template, and nothing else.
    expect(rows()[0]?.querySelector('[data-audit-names]')?.textContent).not.toContain('desk 2');
  });

  it('the caveat and the console-name field are ONE strip, and that strip sits over the table', async () => {
    stubBridge([DESK_2]);
    await render();
    const strip = dialog().querySelector<HTMLElement>('[data-audit-console]');
    expect(strip, 'the console strip').not.toBeNull();
    const field = strip?.querySelector<HTMLInputElement>('#audit-operator');
    const caveat = strip?.querySelector<HTMLElement>('[data-audit-caveat]');
    expect(field, 'the field is INSIDE the strip').not.toBeNull();
    expect(caveat, 'the caveat is INSIDE the same strip').not.toBeNull();
    // `B-143`'s sentence, byte for byte — the three older tests pin the wording; this one
    // pins that it is the caveat BESIDE the field and not a copy elsewhere.
    expect(caveat?.textContent).toContain('It is a LABEL you typed, not a verified sign-in');
    expect(caveat?.textContent).toContain('it says which console, not which person');
    // The strip PRECEDES the table in the document, so it is read before the column it
    // qualifies rather than found under it.
    const table = dialog().querySelector<HTMLElement>('[data-audit-table]');
    expect(table).not.toBeNull();
    const order = strip?.compareDocumentPosition(table as Node) ?? 0;
    expect(order & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // And it is NOT inside the table — beside the column, not a row of it.
    expect(table?.contains(strip)).toBe(false);
  });

  it('the field is small — bounded by the wire limit — and still the ONE writer of the actor', async () => {
    const { written } = stubBridge([DESK_2]);
    await render();
    const field = dialog().querySelector<HTMLInputElement>('#audit-operator');
    expect(field?.value).toBe('desk 2');
    expect(field?.maxLength).toBe(MAX_ACTOR_LENGTH);
    expect(field?.getAttribute('placeholder')).toBe('unattributed');
    await type(field as HTMLInputElement, 'desk 3');
    expect(written).toEqual(['desk 3']);
  });

  it('the actor FILTER still narrows the tail on the bridge, by the same column', async () => {
    const { recentCalls } = stubBridge([DESK_2, NOBODY]);
    await render();
    expect(rows()).toHaveLength(2);
    const filter = dialog().querySelector<HTMLInputElement>('#audit-actor');
    expect(filter).not.toBeNull();
    await type(filter as HTMLInputElement, 'desk 2');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(recentCalls.at(-1)?.actor).toBe('desk 2');
    expect(rows().map((r) => r.getAttribute('data-audit-row'))).toHaveLength(1);
    expect(rows()[0]?.querySelector('[data-audit-actor]')?.textContent).toBe('desk 2');
  });
});

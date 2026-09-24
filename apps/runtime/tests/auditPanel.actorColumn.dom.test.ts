// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuditEntry } from '@cg/shared-schema';
import { AuditPanel } from '../src/renderer/features/audit/AuditPanel.js';
import { clearPortals, openDialog } from './support/dialog.js';
import { fillBridgeStub } from './support/authStub.js';

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
  (window as unknown as { cg: typeof stub }).cg = fillBridgeStub(stub);
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
    /*
      🔴 `OPERATOR-NAME-SWEEP-01` — …and it says, on hover, what the value under it now IS.

      It used to read "the console name typed above — a self-declared label, not a verified
      sign-in", which was true of a browser-held label and is false of a name that came out of
      a signature check. The COLUMN survives (guard item 27); only its qualifier moved.
    */
    expect(actorHead?.getAttribute('title')).toMatch(/as the bridge verified them/);
    // `BRIDGE-TRUTH-01` §4 — and it names BOTH principal-less values, because they are two facts.
    expect(actorHead?.getAttribute('title')).toMatch(/'console'.*'unattributed'/);
    expect(
      actorHead?.getAttribute('title'),
      'the retired caveat came back on the column head',
    ).not.toMatch(/self-declared|verified sign-in|typed/i);
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

  /*
    🔴 `OPERATOR-NAME-SWEEP-01` — **TWO TESTS RETIRED WITH THE THING THEY TESTED.**

    What stood here pinned (a) that the caveat and the console-name field were ONE strip above
    the table, and (b) that the field was bounded by `MAX_ACTOR_LENGTH` and was "the ONE writer
    of the actor". Both were correct and both are now untestable: the field and its sentence
    are gone, because identity is proven (`C-037`/`C-038`) and a caveat calling a verified name
    "a label you typed" is false on screen.

    ⚠ They are DELETED rather than weakened to assert the absence. An absence assertion here
    would pass against a panel that failed to render at all — and the absence IS covered, once,
    by the permanent two-axis guard in `operatorNameRetired.test.ts`, which fails if either the
    symbol or the sentence reappears anywhere in source.

    What SURVIVES is everything about the column itself: its position, its `<bdi>` isolation,
    its title, and the actor FILTER below — the record is still filtered by who acted, and
    under proven identity that question finally has a trustworthy answer.
  */
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

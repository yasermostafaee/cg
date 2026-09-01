// @vitest-environment jsdom
import { StrictMode, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FixedLayerBank, FixedSlotState } from '@cg/shared-ipc';
import { Modal, ModalAction, modalActionVariant } from '../src/renderer/ui/Modal.js';
import { FixedBankConfigModal } from '../src/renderer/features/fixedLayers/FixedBankConfigModal.js';
import { clearPortals, openDialog } from './support/dialog.js';

/**
 * THE MODAL PRIMITIVE — one chrome, three button roles, and one pinned message.
 *
 * ── WHY THE ASSERTIONS ARE ON THE PRIMITIVE, NOT ON EACH DIALOG ─────────────
 *
 * Five dialogs had drifted into five designs: three different close affordances
 * (a ✕, a `Close` BUTTON in the header, and a `Close` in the footer), two title
 * cases, and three action-row layouts. A primitive that four dialogs use while a
 * fifth hand-rolls is WORSE than no primitive — it reads as consistent while not
 * being consistent, which is exactly how those five arrived.
 *
 * So these specs assert on the SHARED component and on the structural rules it
 * enforces. A per-dialog assertion would pass for a dialog that had copied the look
 * without consuming the primitive, which is the failure mode being closed.
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
  vi.restoreAllMocks();
});

async function render(element: ReturnType<typeof createElement>): Promise<HTMLElement> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const r = root;
  await act(async () => {
    r.render(createElement(StrictMode, null, element));
    await Promise.resolve();
    await Promise.resolve();
  });
  const dialog = openDialog();
  if (dialog === null) throw new Error('the dialog did not open');
  return dialog;
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
}

describe('§1 — every dialog gets its chrome from the primitive', () => {
  it('renders ONE close affordance, and it is the ✕ — never a `Close` button in the header', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'Some dialog',
        onClose: () => undefined,
        footer: createElement(ModalAction, { actionRole: 'primary', children: 'Done' }),
        children: 'body',
      }),
    );

    const closers = [...dialog.querySelectorAll('button')].filter(
      (b) => b.getAttribute('aria-label') === 'Close',
    );
    expect(closers.length, 'exactly one close affordance').toBe(1);
    // It is a GLYPH, not the word — `SERVER CONNECTION` spent a dedicated word on
    // what every other dialog does with an icon, and it was the odd one out.
    expect(closers[0]?.textContent ?? '').not.toContain('Close');
    expect(closers[0]?.className).toContain('cg-modal-close');
  });

  /**
   * THE ACTION ROW IS ALWAYS IN THE SAME PLACE. Asserted as DOM order plus the
   * right-aligned footer: first-in-DOM is leftmost, so cancel-first puts the
   * primary action in the same corner of every dialog. The picker had it the other
   * way round and its Cancel was a borderless ghost besides.
   */
  it('puts the action row after the body and the message, in one place', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'Some dialog',
        onClose: () => undefined,
        message: { role: 'refusal' as const, text: 'why it did not happen' },
        footer: [
          createElement(ModalAction, { actionRole: 'cancel', key: 'c', children: 'Cancel' }),
          createElement(ModalAction, { actionRole: 'primary', key: 'p', children: 'Apply' }),
        ],
        children: 'body',
      }),
    );

    const kids = [...dialog.children];
    const index = (sel: string): number => kids.findIndex((k) => k.matches(sel));
    expect(index('[data-modal-body]')).toBeGreaterThanOrEqual(0);
    // body → message → footer. This ORDER is the §3 fix.
    expect(index('[data-modal-message]')).toBeGreaterThan(index('[data-modal-body]'));
    expect(index('.cg-modal-footer')).toBeGreaterThan(index('[data-modal-message]'));

    const labels = [...dialog.querySelectorAll('.cg-modal-footer button')].map(
      (b) => b.textContent,
    );
    expect(labels).toEqual(['Cancel', 'Apply']);
  });
});

describe('§2 — each role resolves to exactly ONE treatment', () => {
  it('maps the three roles to three fixed variants', async () => {
    const dialog = await render(
      createElement(Modal, {
        title: 'Roles',
        onClose: () => undefined,
        footer: [
          createElement(ModalAction, { actionRole: 'cancel', key: 'c', children: 'Cancel' }),
          createElement(ModalAction, {
            actionRole: 'destructive',
            key: 'd',
            children: 'Clear all',
          }),
          createElement(ModalAction, { actionRole: 'primary', key: 'p', children: 'Apply' }),
        ],
      }),
    );

    const byRole = (role: string): HTMLElement | null =>
      dialog.querySelector(`[data-modal-role="${role}"]`);

    // CANCEL IS BORDERED. Neutral must not mean invisible — a `ghost` has no fill
    // and no border and reads as a line of static text.
    expect(byRole('cancel')?.className).toContain('cg-btn--neutral');
    expect(byRole('cancel')?.className).not.toContain('cg-btn--ghost');

    // DESTRUCTIVE is the SOLID treatment, and `Clear all` still resolves to it —
    // unchanged, which is the point. Picking the transparent red outline instead
    // would have made this button quieter, i.e. neutralised it.
    expect(byRole('destructive')?.className).toContain('cg-btn--caution-strong');

    expect(byRole('primary')?.className).toContain('cg-btn--primary');
  });

  /**
   * THE TABLE IS THE ONLY SOURCE. `AsyncButton` cannot be a `ModalAction` (it owns
   * its own busy/success rendering), so it resolves its variant through
   * `modalActionVariant` — this pins that the helper and the component agree, which
   * is what stops `SERVER CONNECTION`'s APPLY from re-picking a colour by hand.
   */
  it('exposes the SAME mapping to callers that cannot use the component', () => {
    expect(modalActionVariant('primary')).toBe('primary');
    expect(modalActionVariant('destructive')).toBe('caution-strong');
    expect(modalActionVariant('cancel')).toBe('neutral');
  });

  it('a role never resolves to two treatments across dialogs', async () => {
    // Two independent dialogs, same role, same class — asserted rather than assumed,
    // because "one treatment per role" is a claim about EVERY dialog and a single
    // rendering cannot make it.
    const first = await render(
      createElement(Modal, {
        title: 'One',
        onClose: () => undefined,
        footer: createElement(ModalAction, { actionRole: 'destructive', children: 'Clear all' }),
      }),
    );
    const firstClass = first.querySelector('[data-modal-role="destructive"]')?.className;
    await act(async () => {
      root?.unmount();
    });
    root = null;
    clearPortals();

    const second = await render(
      createElement(Modal, {
        title: 'Two',
        onClose: () => undefined,
        footer: createElement(ModalAction, { actionRole: 'destructive', children: 'Remove' }),
      }),
    );
    expect(second.querySelector('[data-modal-role="destructive"]')?.className).toBe(firstClass);
  });
});

/**
 * §3 — THE REAL DEFECT: a refusal appended to scrollable content can go unseen.
 *
 * `Candidate layers — configuration` appended its refusal to the BOTTOM of the
 * scrolling candidate-layer list. With the list scrolled to the top and the
 * offending row far down, the operator pressed Apply, nothing happened, and the
 * explanation was below the fold — he had to go and look for why his action did not
 * take. A refusal reported where the operator is not looking is a SILENT refusal,
 * and this one guards an occupied layer.
 *
 * ── WHAT IS ASSERTED, AND THE HONEST LIMIT OF IT ────────────────────────────
 *
 * The task asks for visibility "in the viewport without scrolling", which is a
 * LAYOUT claim — and jsdom computes no layout, so a `getBoundingClientRect` here
 * would return zeros and pass for the broken code too. What is asserted instead is
 * the MECHANISM that produces the visibility: the message is NOT inside the
 * scrolling body, and it sits between the body and the action row. That is exactly
 * the property the old code violated and the new code has, and unlike a geometry
 * assertion it cannot silently pass.
 *
 * THE TRUE IN-VIEWPORT ASSERTION NOW EXISTS, and it is no longer owed: it lives in
 * `tests/e2e/modal-message-in-viewport.spec.ts`, where a real layout engine scrolls a
 * genuinely-overflowing dialog body to the top and asserts the refusal is still in
 * the viewport — with a negative control proving the check can fail. This spec keeps
 * the mechanism assertion beside it deliberately: the structural property is what a
 * future dialog breaks, and it fails in milliseconds rather than in a browser.
 */
describe('§3 — a refusal is pinned beside the action row, never appended to the scroll', () => {
  const BANK: FixedLayerBank = {
    channel: 1,
    low: { start: 1, count: 9 },
    // THIRTY layers, so the list genuinely scrolls and a refusal about a row far
    // down is genuinely off-screen when the list is at the top. Four would not
    // reproduce the operator's situation at all.
    start: 70,
    count: 30,
    aliases: {},
  };
  const SLOTS: FixedSlotState[] = Array.from({ length: 30 }, (_, i) => ({
    channel: 1,
    layer: 70 + i,
    observed: { kind: 'empty' as const },
    binding: null,
  }));

  function stubBridge(): void {
    const stub = {
      link: {
        status: () => 'live',
        onStatusChanged: () => () => undefined,
        resyncing: () => false,
        onResyncingChanged: () => () => undefined,
      },
      stack: { snapshot: () => Promise.resolve([]), onStateChanged: () => () => undefined },
      fixedLayers: {
        // The refusal the owner hit: a row far down the list is occupied.
        setConfig: () =>
          Promise.resolve({
            ok: false,
            reason: 'occupied-layer',
            message: 'Layer 95 has a template on it.',
          }),
      },
    };
    (window as unknown as { cg: typeof stub }).cg = stub;
  }

  async function openAndRefuse(): Promise<HTMLElement> {
    stubBridge();
    const dialog = await render(
      createElement(FixedBankConfigModal, { bank: BANK, slots: SLOTS, onClose: () => undefined }),
    );
    await settle();
    const apply = [...dialog.querySelectorAll('.cg-modal-footer button')].find(
      (b) => b.textContent === 'Apply',
    );
    if (apply === undefined) throw new Error('Apply not rendered');
    await act(async () => {
      (apply as HTMLElement).click();
      await Promise.resolve();
    });
    await settle();
    return dialog;
  }

  it('THE BUG: the refusal is not inside the scrolling body', async () => {
    // ── the assertion that goes RED without the fix ────────────────────────
    const dialog = await openAndRefuse();

    const message = dialog.querySelector('[data-modal-message]');
    expect(message, 'the refusal must be shown at all').not.toBeNull();

    const body = dialog.querySelector('[data-modal-body]');
    expect(body, 'the dialog must still have a scrolling body').not.toBeNull();
    expect(
      body?.contains(message as Node),
      'the refusal was appended to content the operator may have scrolled away from',
    ).toBe(false);

    // …and it sits immediately beside the action row, which is where the operator
    // is looking, because that is where he just clicked.
    const kids = [...dialog.children];
    expect(kids.indexOf(message as Element)).toBe(
      kids.findIndex((k) => k.matches('.cg-modal-footer')) - 1,
    );
  });

  it('does not shorten the message — the cause AND the remedy both survive', async () => {
    const dialog = await openAndRefuse();
    const text = dialog.querySelector('[data-modal-message]')?.textContent ?? '';
    // The bridge's own sentence, verbatim: it names the layer.
    expect(text).toContain('Layer 95 has a template on it.');
    // …and the mapped rule, which is the remedy.
    expect(text.length).toBeGreaterThan('Layer 95 has a template on it.'.length);
  });

  /**
   * IT MUST NOT MOVE THE BODY'S SCROLL POSITION. The operator should not lose his
   * place at the moment he is being told something. Being a SIBLING of the scroll
   * container rather than a child is what guarantees it: appearing cannot reflow
   * content the operator is looking at inside a different element.
   */
  it('leaves the scrolling body a separate container, so appearing cannot move it', async () => {
    const dialog = await openAndRefuse();
    const body = dialog.querySelector<HTMLElement>('[data-modal-body]');
    const message = dialog.querySelector<HTMLElement>('[data-modal-message]');
    expect(body).not.toBeNull();
    expect(message).not.toBeNull();
    // Siblings, not ancestor/descendant, in either direction.
    expect(body?.contains(message as Node)).toBe(false);
    expect(message?.contains(body as Node)).toBe(false);
    expect(message?.parentElement).toBe(body?.parentElement);
  });

  it('§4 — the gate itself does not move: a refusal keeps the dialog open', async () => {
    // The `Candidate layers` gate is a closed decision; this task changes only WHERE
    // its refusal is shown. A refusal must still refuse — the dialog stays open with
    // the operator's edits intact, exactly as before.
    const dialog = await openAndRefuse();
    expect(openDialog()).not.toBeNull();
    // Thirty operator rows plus the nine declared bed rows (`single-clock-look-switch`) —
    // the dialog lists every candidate layer of BOTH halves.
    expect(dialog.querySelectorAll('input[type="checkbox"]').length).toBe(39);
  });
});

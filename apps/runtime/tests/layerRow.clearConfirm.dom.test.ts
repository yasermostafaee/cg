// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import type { StackItemState } from '@cg/shared-schema';
import { itemWith, renderLayerRow, slotWith, type RenderedRow } from './support/layerRow.js';

/**
 * R-021 task 4.3 (owner decision b1) — **WHAT THE HARD-CLEAR CONFIRMATION SAYS
 * ABOUT OCCUPANCY.**
 *
 * b1 permits the hard Clear on a declared row under OSC silence. That permission is
 * the feature — it is precisely when a layer is stuck and the console cannot see
 * that an operator needs it, so `clearBankLayer` is gated by STRUCTURE (in the
 * declared bank, not reserved) and never by observation.
 *
 * The price of allowing it blind is paid here, in the DIALOG. An operator who
 * believes the console checked the layer will press through a confirmation they
 * would otherwise stop and read; and under silence the LAYER NUMBER is the only
 * thing they can carry to a rack. So the sentence branches on what the wire
 * actually said, and every branch names the layer.
 *
 * The three branches are not decoration. Warning about destroying a graphic on a
 * layer the console can SEE is empty (`empty`) is how an operator is trained to
 * click through the warnings that matter, and that habit is what makes a real one
 * useless.
 */

let rendered: RenderedRow | null = null;

afterEach(async () => {
  await rendered?.unmount();
  rendered = null;
  vi.restoreAllMocks();
});

async function openClearDialog(
  slot: ReturnType<typeof slotWith>,
  item: StackItemState | null = itemWith('on-air'),
): Promise<string> {
  rendered = await renderLayerRow({ item, slot });
  const clear = [...rendered.container.querySelectorAll('button')].find(
    (b) => b.textContent === 'CLEAR',
  );
  await act(async () => {
    clear?.click();
    await Promise.resolve();
  });
  return document.querySelector('[role="dialog"]')?.textContent ?? '';
}

describe('the hard-Clear confirmation states what we can SEE, and names the layer', () => {
  it('UNKNOWN occupancy — says so outright, and still names the layer number', async () => {
    // The b1 case. The clear is offered (that is the whole carve-out), so the
    // dialog must not imply the console looked: it says it CANNOT tell, and says
    // the clear happens anyway.
    const body = await openClearDialog(slotWith({ observed: { kind: 'unknown' } }));
    expect(body).toMatch(/CANNOT tell you what is on it/i);
    // Never "empty". `unknown` and `empty` are opposite claims (B-094), and a
    // dialog that conflated them here would be doing it at the exact moment the
    // operator is deciding whether to destroy something.
    expect(body).not.toMatch(/reports layer 1-70 as empty/i);
    // The layer number, which under silence is the only fact an operator can act
    // on away from this screen.
    expect(body).toContain('1-70');
  });

  it('an observed PRODUCER — names its KIND, which is what stops a wrong click', async () => {
    // This is also exactly the state a `restore-blocked` row is in, and the fact
    // that matters is not "occupied" but WHAT: "there is a decklink on 1-70" is
    // what tells the operator this is somebody else's feed.
    const body = await openClearDialog(
      slotWith({ observed: { kind: 'producer', producer: 'decklink' } }),
    );
    expect(body).toMatch(/decklink/);
    expect(body).toContain('1-70');
  });

  it('an observed EMPTY layer — says that too, rather than warning about nothing', async () => {
    const body = await openClearDialog(slotWith({ observed: { kind: 'empty' } }));
    expect(body).toMatch(/reports layer 1-70 as empty/i);
  });

  it('the UNBOUND row keeps its own wording AND gains the occupancy sentence', async () => {
    // The two halves of CLEAR are different acts — `stack.out` on a bound row,
    // the bank-scoped layer clear on an unbound one — so they keep different
    // bodies. What they must NOT differ on is honesty about the layer.
    // An unbound row genuinely has no item — that is what makes it the other half
    // of CLEAR (the bank-scoped layer clear rather than `stack.out`).
    const body = await openClearDialog(
      slotWith({ binding: null, observed: { kind: 'unknown' } }),
      null,
    );
    expect(body).toMatch(/this row holds no template/i);
    expect(body).toMatch(/CANNOT tell you what is on it/i);
    expect(body).toContain('1-70');
  });
});

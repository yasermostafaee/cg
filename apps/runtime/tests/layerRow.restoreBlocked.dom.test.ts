// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toMenuItems } from '../src/renderer/ui/rowAction.js';
import {
  layerRowActions,
  RESTORE_BLOCKED_REASON,
} from '../src/renderer/features/layers/layerRowActions.js';
import { rowState } from '../src/renderer/features/layers/rowState.js';
import {
  bindingFor,
  itemWith,
  renderLayerRow,
  rowDeps,
  slotWith,
  type RenderedRow,
} from './support/layerRow.js';

/**
 * R-021 stage 4 (task 3.3, renderer half) — **THE `restore-blocked` ROW**.
 *
 * The state exists because of one situation: a bridge restart finds a declared
 * operator row already carrying a producer that is provably not ours. The bridge
 * parks — it will not adopt somebody else's producer as our item, and it will not
 * destroy it either, because an automatic path never destroys (design.md §d,
 * owner decision d1).
 *
 * What the CONSOLE then owes the operator is exactly two things, and they are what
 * this file pins:
 *
 *   1. **Both facts, on the row.** The item that is waiting, and what is actually
 *      on its layer. A row that showed only one of them would be the "silent
 *      absence" d1 rules out — and the retained item is usually `on-air`, so a row
 *      that simply published its status would wear the broadcast colour over a
 *      layer we have just PROVEN is not carrying it.
 *   2. **No verb that would command that layer**, and CLEAR still available —
 *      because CLEAR is the documented way OUT of the state, not a hazard in it.
 */

let rendered: RenderedRow | null = null;

afterEach(async () => {
  await rendered?.unmount();
  rendered = null;
  vi.restoreAllMocks();
});

/** A row whose restore parked: our item bound, a decklink observed on the layer. */
const blockedSlot = slotWith({
  observed: { kind: 'producer', producer: 'decklink' },
  binding: {
    itemId: 'item-1',
    templateType: 'clock',
    templateId: 'tpl-1',
    restoreBlocked: true,
  },
});

describe('rowState — BLOCKED outranks the item’s own status', () => {
  const base = {
    pending: false,
    linkDown: false,
    casparUnreachable: false,
    simulated: false,
    oscBlind: false,
    rehearsing: false,
  };

  it('an ON-AIR item on a blocked row reads BLOCKED, never the air claim', () => {
    // THE POINT OF THE WHOLE STATE. Retention brings the item back as it last was,
    // which for the interesting case is `on-air` — so without the block winning
    // here, the row would answer the control room's one urgent question ("what is
    // on air?") with a confident yes about a graphic that is demonstrably not on
    // the layer.
    const blocked = rowState({
      ...base,
      binding: bindingFor(itemWith('on-air')),
      observed: { kind: 'producer', producer: 'decklink' },
      restoreBlocked: true,
    });
    expect(blocked.label).toBe('BLOCKED');
    expect(blocked.tone).toBe('attention');

    // …and the same row WITHOUT the block is the ordinary air claim, so the
    // assertion above is about the block and not about something else.
    const notBlocked = rowState({
      ...base,
      binding: bindingFor(itemWith('on-air')),
      observed: { kind: 'producer', producer: 'decklink' },
      restoreBlocked: false,
    });
    expect(notBlocked.label).not.toBe('BLOCKED');
    expect(notBlocked.tone).toBe('onair');
  });

  it('names the OBSERVED producer and the way out — both facts, one tooltip', () => {
    const s = rowState({
      ...base,
      binding: bindingFor(itemWith('on-air')),
      observed: { kind: 'producer', producer: 'decklink' },
      restoreBlocked: true,
    });
    // The layer's own account rides through the canonical `occupancyLabel`, so the
    // row cannot come to describe the layer differently from anywhere else.
    expect(s.title).toContain('decklink');
    // Nothing was sent — the property that makes this state safe, stated where the
    // operator will look for it.
    expect(s.title).toMatch(/nothing was cleared/i);
    // And the exit, which is deliberately two steps.
    expect(s.title).toMatch(/CLEAR the layer and then PLAY/i);
  });

  it('is NOT greyed like an unverifiable row — we looked, and we got an answer', () => {
    // `unverified` means the wire cannot back the claim; BLOCKED means the wire
    // ANSWERED and the answer was somebody else. Collapsing the two would hide a
    // known trespass inside the word for ignorance.
    const s = rowState({
      ...base,
      binding: bindingFor(itemWith('on-air')),
      observed: { kind: 'producer', producer: 'decklink' },
      restoreBlocked: true,
    });
    expect(s.unverifiable).toBeUndefined();
    // Distinct SHAPE as well as hue — the module's rule, so a monochrome gallery
    // display still separates it from every circle in the set.
    expect(s.icon).not.toBe(
      rowState({
        ...base,
        binding: bindingFor(itemWith('on-air')),
        observed: { kind: 'producer', producer: 'decklink' },
        restoreBlocked: false,
      }).icon,
    );
  });
});

describe('layerRowActions — a blocked row commands nothing, but is never stranded', () => {
  const deps = (over = {}) =>
    layerRowActions(
      rowDeps({
        binding: bindingFor(itemWith('on-air')),
        observed: { kind: 'producer', producer: 'decklink' },
        restoreBlocked: true,
        hasNext: true,
        dirty: true,
        ...over,
      }),
    );

  it('holds every verb that would reach the layer — PLAY, NEXT, UPDATE, STOP, ON PVW', () => {
    const byKey = new Map(deps().map((a) => [a.key, a]));
    // Each of these would address a layer carrying another system's producer:
    // PLAY re-ADDs over it, UPDATE and NEXT talk to it, STOP asks it to exit, and
    // ON PVW MUTES it. None of them is ours to send.
    for (const key of ['play', 'next', 'update', 'stop', 'rehearse']) {
      expect(byKey.get(key)?.disabled, `${key} must be held on a blocked row`).toBe(true);
    }
  });

  it('says WHY, in the one shared sentence — never a per-verb paraphrase', () => {
    const byKey = new Map(deps().map((a) => [a.key, a]));
    for (const key of ['play', 'next', 'update', 'stop']) {
      expect(byKey.get(key)?.title, `${key} must explain the block`).toBe(RESTORE_BLOCKED_REASON);
    }
    // The sentence names the way out rather than only the refusal — a held verb
    // with no next step is how an operator concludes the console is broken.
    expect(RESTORE_BLOCKED_REASON).toMatch(/CLEAR the layer first/i);
  });

  it('KEEPS CLEAR and REMOVE — the block is what they exist to resolve', () => {
    const byKey = new Map(deps().map((a) => [a.key, a]));
    // Holding the escape hatch on a row whose entire problem is a producer in the
    // way would be fail-STUCK, not fail-safe. CLEAR is also d1's own first exit:
    // the operator's explicit, confirm-gated hard Clear, and then a take.
    expect(byKey.get('clear')?.disabled).toBe(false);
    expect(byKey.get('load-remove')?.disabled).toBe(false);
    expect(byKey.get('load-remove')?.label).toBe('REMOVE');
  });

  it('LEAVING rehearse is never held — only entering it', () => {
    // Symmetry would be a trap: entering mutes the layer (a trespass), leaving
    // un-mutes and commands nothing. A row stuck ON PVW with no way off is a
    // graphic that cannot reach air.
    const byKey = new Map(deps({ rehearsing: true }).map((a) => [a.key, a]));
    expect(byKey.get('rehearse')?.disabled).toBe(false);
    expect(byKey.get('rehearse')?.label).toBe('OFF PVW');
  });

  it('the MENU agrees with the buttons — one declaration, two surfaces', () => {
    const actions = deps();
    const menu = toMenuItems(actions);
    expect(menu).toHaveLength(actions.length);
    // Matched by LABEL, like the parity test in `layerRow.dom.test.ts`: the menu
    // REORDERS (REMOVE is last there), so an index match would assert nothing.
    for (const action of actions) {
      const entry = menu.find((m) => m.label === action.label);
      expect(entry, `${action.label} missing from the menu`).toBeDefined();
      expect(entry?.disabled, `${action.label} must match in the menu`).toBe(action.disabled);
    }
  });
});

describe('LayerRow — the blocked row, rendered', () => {
  it('shows BLOCKED with the air verbs held and CLEAR live', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air'), slot: blockedSlot });
    const buttons = rendered.buttons();
    expect(buttons.get('PLAY')).toBe(true);
    expect(buttons.get('STOP')).toBe(true);
    expect(buttons.get('CLEAR')).toBe(false);
    // The word an operator reads, and the tone a test can locate without matching
    // a hex value.
    expect(rendered.container.textContent).toContain('BLOCKED');
    expect(rendered.container.querySelector('[data-row-state="attention"]')).not.toBeNull();
  });

  it('an ordinary ON-AIR row is untouched by all of this', async () => {
    // The guard on the guard: every assertion above must be caused by the block and
    // not by the observation or the status that happen to accompany it.
    rendered = await renderLayerRow({ item: itemWith('on-air') });
    const buttons = rendered.buttons();
    expect(buttons.get('STOP')).toBe(false);
    expect(rendered.container.textContent).not.toContain('BLOCKED');
  });
});

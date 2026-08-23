// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { toMenuItems } from '../src/renderer/ui/rowAction.js';
import {
  layerRowActions,
  MISSING_TEMPLATE_REASON,
} from '../src/renderer/features/layers/layerRowActions.js';
import type { StackItemState } from '@cg/shared-schema';
// `add-multibox-audio` — the row's own declaration of how wide the verb block is. Asserted
// against, never restated as a literal: a test carrying its own `6` would keep passing on the
// day the block grew a seventh button and the header words slid off their glyphs.
import { VERB_COUNT } from '../src/renderer/features/layers/layerTable.js';
import {
  bindingFor,
  itemWith,
  renderLayerRow,
  rowDeps,
  slotWith,
  templateWith,
  type RenderedRow,
} from './support/layerRow.js';

/**
 * R-028 part B (task 5.5) — the layer row's verb contract.
 *
 * This file carries forward the properties the deleted StackRow tests pinned —
 * the B-053 per-status gating, R-006's offline refusal, C-012's STOP/CLEAR
 * pairing and the CLEAR-is-not-REMOVE distinction, and B-086/B-087's on-air
 * masking — onto the row that replaced it, plus the new R-028 rules:
 * present-but-disabled verbs before a load, and NEXT only where it can act.
 */

let rendered: RenderedRow | null = null;

afterEach(async () => {
  await rendered?.unmount();
  rendered = null;
  vi.restoreAllMocks();
});

async function buttonsFor(
  ...args: Parameters<typeof renderLayerRow>
): Promise<Map<string, boolean>> {
  rendered = await renderLayerRow(...args);
  return rendered.buttons();
}

describe('LayerRow — verbs are present from the start, enabled by state (R-028 point 8)', () => {
  it('an EMPTY row shows every verb, with LOAD and CLEAR enabled', async () => {
    const buttons = await buttonsFor({ item: null, template: null });
    // The owner's point 8: the buttons exist before a load, rendered disabled.
    // A disabled button is not the "enabled control that can only reject" that
    // R-021 stage 2b forbids — and a fixed control set does not move the target
    // under the operator's hand as state changes.
    expect(buttons.get('LOAD')).toBe(false);
    expect(buttons.get('PLAY')).toBe(true);
    expect(buttons.get('STOP')).toBe(true);
    // CLEAR IS ENABLED HERE NOW, and this assertion was flipped deliberately — it is
    // the requirement, not a relaxation.
    //
    // It used to be disabled on an unbound row for a sound reason: `stack.out` is
    // ITEM-scoped, so with nothing bound an enabled CLEAR would have been a no-op that
    // REPORTED SUCCESS — worse than a disabled one, because it looks like it worked.
    // The answer was never to enable the button; it was the missing capability, which
    // now exists. An unbound row routes to the BANK-SCOPED layer clear, addressed to
    // the layer and permitted by STRUCTURE (in the declared bank, not reserved) rather
    // than by observation — so it does something real, and it works precisely when
    // occupancy reads `unknown`.
    expect(buttons.get('CLEAR')).toBe(false);
  });

  it('a LOADED row: PLAY enabled, STOP disabled — and CLEAR available anyway', async () => {
    const buttons = await buttonsFor({ item: itemWith('loaded') });
    expect(buttons.get('PLAY')).toBe(false);
    expect(buttons.get('STOP')).toBe(true);
    // CLEAR IS ENABLED even though this item's status says it is not on air.
    // Deliberate, and the opposite of the fail-closed rule the other verbs follow:
    // refusing LOAD when the state model is uncertain is safe (nothing happens),
    // but refusing CLEAR strands a graphic on air with nothing to remove it. The
    // status is exactly what might be wrong, so it may not gate the remedy.
    expect(buttons.get('CLEAR')).toBe(false);
    // The LOAD/REMOVE toggle: one control in one position, flipped by state.
    // Re-binding an occupied row is still two explicit steps (REMOVE, then
    // LOAD) — the toggle is a visual pattern, never a compound verb.
    expect(buttons.has('LOAD')).toBe(false);
    expect(buttons.get('REMOVE')).toBe(false);
  });

  it('an ON-AIR row: PLAY disabled; STOP and CLEAR both enabled (C-012 pairing)', async () => {
    const buttons = await buttonsFor({ item: itemWith('on-air') });
    expect(buttons.get('PLAY')).toBe(true);
    // STOP and CLEAR are the two ways off air and share one `isOnAir`
    // predicate, so offering one without the other would read as a missing
    // option.
    expect(buttons.get('STOP')).toBe(false);
    expect(buttons.get('CLEAR')).toBe(false);
  });

  it('R-006 — DISCONNECTED disables every verb except CLEAR, which is the escape hatch', async () => {
    const buttons = await buttonsFor({ item: itemWith('on-air'), link: 'disconnected' });
    // EVERY verb, CLEAR INCLUDED — the exemption is reversed, see below.
    for (const [label, disabled] of buttons) {
      expect(disabled, `${label} must be disabled with the bridge down`).toBe(true);
    }
    /*
      CLEAR IS NOW DISABLED WITH THE BRIDGE DOWN — this assertion is REVERSED
      deliberately, not dropped.

      The escape-hatch rule stands where it was aimed: CLEAR is never gated on the
      row's STATUS, because the status is exactly what may be wrong when the
      operator reaches for it. Reachability is a different question. With the
      bridge down the command does not leave at all, so an enabled button was not
      a remedy — only the appearance of one, and it costs the operator the seconds
      in which he believes the graphic is coming off.

      It returns the instant the link does, which is what keeps this a gate rather
      than a removal of the hatch.
    */
    expect(buttons.get('CLEAR'), 'CLEAR cannot act with the bridge down').toBe(true);
  });

  it('TEST MODE keeps the verbs live — simulating them is the point', async () => {
    const buttons = await buttonsFor({ item: itemWith('on-air'), link: 'offline-mock' });
    expect(buttons.get('STOP')).toBe(false);
    expect(buttons.get('CLEAR')).toBe(false);
  });
});

describe('LayerRow — NEXT is enabled only where it can act (5.4)', () => {
  it('is PRESENT but disabled when the template has no next step', async () => {
    const buttons = await buttonsFor({
      item: itemWith('on-air'),
      template: templateWith({ hasNext: false }),
    });
    // The shape never changes: NEXT stays put and greys out. An earlier draft
    // withheld it entirely, which made the button row RESHAPE the moment a
    // single-step template landed — the controls beside it moved under the
    // operator's finger. Disabled is not the "enabled control that can only
    // reject" R-021 stage 2b forbids; a disabled control invites nothing.
    expect(buttons.get('NEXT')).toBe(true);
  });

  it('is offered and enabled on air when the template HAS a next step', async () => {
    const buttons = await buttonsFor({
      item: itemWith('on-air'),
      template: templateWith({ hasNext: true }),
    });
    expect(buttons.get('NEXT')).toBe(false);
  });

  it('is present but disabled while that same template is only loaded', async () => {
    const buttons = await buttonsFor({
      item: itemWith('loaded'),
      template: templateWith({ hasNext: true }),
    });
    expect(buttons.get('NEXT')).toBe(true);
  });

  it('dispatches stack.next for the bound item', async () => {
    rendered = await renderLayerRow({
      item: itemWith('on-air'),
      template: templateWith({ hasNext: true }),
    });
    const next = [...rendered.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'NEXT',
    );
    await act(async () => {
      next?.click();
      await Promise.resolve();
    });
    expect(rendered.stubs.next).toHaveBeenCalledWith({ itemId: 'item-1' });
  });
});

describe('LayerRow — CLEAR and REMOVE stay distinct verbs (C-012)', () => {
  it('CLEAR dispatches the OUT intent and is not REMOVE', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air') });
    const clear = [...rendered.container.querySelectorAll('button')].find(
      (b) => b.textContent === 'CLEAR',
    );
    await act(async () => {
      clear?.click();
      await Promise.resolve();
    });
    // The confirm gate stands between the click and the wire, so nothing is
    // dispatched yet — clearing air is destructive and asks first.
    expect(rendered.stubs.out).not.toHaveBeenCalled();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('with no outro');
    const confirmBtn = [...(dialog?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'Clear layer',
    );
    await act(async () => {
      confirmBtn?.click();
      await Promise.resolve();
    });
    expect(rendered.stubs.out).toHaveBeenCalledWith({ itemId: 'item-1' });
    // Clearing air is NOT dropping the row: REMOVE is a different verb.
    expect(rendered.stubs.remove).not.toHaveBeenCalled();
  });
});

describe('LayerRow — what the row says (4.2)', () => {
  it('shows the alias as the primary label, and keeps the layer number reachable', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air') });
    const text = rendered.container.textContent ?? '';
    // The ALIAS is what the operator thinks in, so it is the row's title.
    expect(text).toContain('CLOCK');

    /*
      The real CasparCG layer number is NO LONGER A COLUMN — owner decision, it lives
      in the Inspector. What makes that safe is the mitigation asserted here: it is
      carried by the ROW's own tooltip and accessible name, so it stays one hover or
      one keyboard focus away at every density.

      This has to keep holding. The layer number is the vocabulary shared with the
      playout side (the reservation is 60–69, not "rows 1–4"), and on a narrow screen
      the Inspector is an overlay behind a hamburger — so if the row stopped carrying
      it, it would be unreachable exactly while somebody was troubleshooting.
    */
    const row = rendered.container.querySelector('[data-layer="70"]');
    expect(row?.getAttribute('title')).toContain('CasparCG layer 1-70');
    expect(row?.getAttribute('aria-label')).toContain('CasparCG layer 1-70');
    // And it is NOT rendered as visible text any more.
    expect(text).not.toContain('70');
  });

  it('an empty row says so instead of naming a template', async () => {
    rendered = await renderLayerRow({ item: null, template: null });
    expect(rendered.container.textContent).toContain('Empty');
  });

  it('B-087 — with the bridge down the row reads unknown, never a frozen air claim', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air'), link: 'disconnected' });
    const text = rendered.container.textContent ?? '';
    // The claim is DEMOTED to the muted "WAS ON AIR", and the sacred air-colour tone
    // is withheld — that role is reserved for a graphic a live wire confirms.
    expect(text).toContain('WAS ON AIR');
    // The row's state cell carries its ROLE as a data attribute (the badge pill
    // was replaced by the state column when the verbs went neutral). Asserting
    // the role, not a hex colour: the property that matters is "not the on-air
    // role", and a colour assertion would break on any palette tuning while
    // saying nothing about it.
    const state = rendered.container.querySelector('[data-row-state]');
    expect(state?.getAttribute('data-row-state')).not.toBe('onair');
    /*
      And the occupancy still reads UNKNOWN — the B-094 claim that silence is never
      emptiness. It is asserted on the state cell's TOOLTIP because the Description
      column was removed from the row: the wire's report moved into that tooltip
      rather than being dropped, which is precisely what made removing the column
      safe. If this attribute ever stops carrying it, the row has gone quiet about
      what CasparCG actually said, and that is the regression to catch.
    */
    expect(state?.getAttribute('title')).toContain('occupancy unknown');
  });
});

describe('LayerRow — buttons and menu derive from ONE list (5.2/5.5)', () => {
  /** The row's action list, built the way the row builds it. */
  const actionsFor = (over: Parameters<typeof layerRowActions>[0]) => layerRowActions(over);

  /**
   * `observed` DEFAULTS TO AN OCCUPIED LAYER for a BOUND row and an empty one
   * otherwise — i.e. to the state each row is normally in.
   *
   * It used to be hardcoded empty, which was harmless while the toggle read
   * `item === null`. Once binding and occupancy became separate facts, a bound
   * row on an EMPTY layer is the post-CLEAR state and correctly shows LOAD, so a
   * test that wanted the REMOVE half had to say which layer it meant. Callers
   * that are ABOUT occupancy pass it explicitly.
   */
  const deps = (
    item: StackItemState | null,
    hasNext: boolean,
    observed: Parameters<typeof layerRowActions>[0]['observed'] = item === null
      ? { kind: 'empty' as const }
      : { kind: 'producer' as const, producer: 'html' },
  ) => ({
    // A spec still names a row by its item, and `bindingFor` turns that into the
    // union the verbs actually read. `null` here means UNBOUND and only unbound —
    // the third case (`awaiting`) is named, never reached by passing nothing.
    binding: bindingFor(item),
    observed,
    hasNext,
    linkDown: false,
    // §0a — both hops up unless the spec is about being disconnected.
    casparReach: 'reachable' as const,
    dirty: true,
    // R-022 — not rehearsing by default; the interlock is exercised on its own below.
    rehearsing: false,
    toggleRehearse: () => Promise.resolve({ accepted: true }),
    load: () => Promise.resolve({ accepted: true }),
    reload: () => Promise.resolve({ accepted: true }),
    templateAvailable: true,
    play: () => Promise.resolve({ accepted: true }),
    next: () => Promise.resolve({ accepted: true }),
    update: () => Promise.resolve({ accepted: true }),
    stop: () => Promise.resolve({ accepted: true }),
    clear: () => Promise.resolve({ accepted: true }),
    clearLayer: () => Promise.resolve({ accepted: true }),
    remove: () => Promise.resolve({ accepted: true }),
    /*
      🔴 **SESSION BR — THESE FOUR WERE MISSING, AND THEIR ABSENCE MADE THE SHAPE TEST BELOW
      ASSERT SOMETHING NARROWER THAN ITS OWN TITLE.**

      `LayerRowActionDeps` requires them; this builder omitted them, and nothing caught it
      because `apps/runtime`'s typecheck did not include `tests/` and Vitest transpiles
      without checking. At runtime `deps.hasLivePlates` was therefore `undefined` — falsy —
      so `swap-source` and `plate-audio` were **structurally absent from every action list
      this file has ever built**. See the SHAPE test for what that cost.

      `restoreBlocked: false` is likewise the honest default (R-021 stage 4's "this layer is
      not ours to command" is a state a spec must opt INTO), and the two handlers are stubs
      of the same shape as their neighbours.
    */
    restoreBlocked: false,
    hasLivePlates: false,
    swapSource: () => Promise.resolve({ accepted: true }),
    plateAudio: () => Promise.resolve({ accepted: true }),
    onError: () => undefined,
  });

  it('R-022 — REHEARSE interlocks PLAY, stays a toggle, and never disables CLEAR', () => {
    const loaded = deps(itemWith('loaded'), true);

    // Not rehearsing: PLAY is available, the toggle offers REHEARSE.
    const idle = layerRowActions(loaded);
    expect(idle.find((a) => a.key === 'play')?.disabled).toBe(false);
    expect(idle.find((a) => a.key === 'rehearse')?.label).toBe('ON PVW');
    expect(idle.find((a) => a.key === 'rehearse')?.disabled).toBe(false);

    // Rehearsing: PLAY is interlocked off and the toggle offers the way back.
    // (The GUARANTEE is the bridge's own refusal — this is the courtesy half.)
    const rehearsing = layerRowActions({ ...loaded, rehearsing: true });
    expect(rehearsing.find((a) => a.key === 'play')?.disabled).toBe(true);
    expect(rehearsing.find((a) => a.key === 'rehearse')?.label).toBe('OFF PVW');
    // Leaving must ALWAYS be available — it is the only route back to a playable row.
    expect(rehearsing.find((a) => a.key === 'rehearse')?.disabled).toBe(false);
    // CLEAR is the escape hatch and rehearse is precisely a state where the model
    // can get confused, so it keeps its no-gate-at-all rule here too.
    expect(rehearsing.find((a) => a.key === 'clear')?.disabled).toBe(false);

    // An ON-AIR row cannot ENTER rehearse (it would mute a live graphic), and the
    // renderer mirrors the bridge's `on-air` refusal rather than restating it loosely.
    const onAir = layerRowActions(deps(itemWith('on-air'), true));
    expect(onAir.find((a) => a.key === 'rehearse')?.disabled).toBe(true);

    // An EMPTY row has nothing to rehearse.
    const empty = layerRowActions(deps(null, false));
    expect(empty.find((a) => a.key === 'rehearse')?.disabled).toBe(true);
  });

  /**
   * R-022 — the ENGAGED toggle is the ONE row verb that wears a colour, and it
   * wears the row's own REHEARSING violet.
   *
   * Asserted on the DECLARATION rather than on a hex, like every other colour
   * claim in this suite: the value lives in `--r-rehearsing-strong` and the
   * declaration is what the button and its right-click twin both read, so this
   * pins the property that can actually break — the fill following the mode, and
   * following it on the rehearsing row ONLY.
   *
   * The neutral rule is unaffected and that is the point of the second half: every
   * other verb stays colourless in both states. Colour on a row verb was removed
   * because thirty coloured affordances drowned the state signal; a lit toggle is
   * not an affordance advertising what it COULD do, it is a mode saying it IS on.
   */
  /**
   * The per-verb HOVER tones. Every verb that has a colour declares it, and the
   * LOAD/REMOVE toggle — one key, one slot — declares a DIFFERENT one per half,
   * which is the case that could not have worked off the key alone.
   *
   * Asserted on the declaration, not on a hex: the values live in `--r-verb-*`
   * and `tokenParity` already pins those against `theme.ts`. What can break here
   * is a verb losing its tone in a refactor, or the toggle's two halves collapsing
   * onto one colour.
   */
  it('every coloured verb declares its hover tone, and LOAD/REMOVE differ', () => {
    const onEmpty = layerRowActions(deps(null, false));
    expect(onEmpty.find((a) => a.key === 'load-remove')?.tone).toBe('load');

    const onBound = layerRowActions(deps(itemWith('loaded'), true));
    // Same key, same slot, different verb — and therefore a different colour.
    expect(onBound.find((a) => a.key === 'load-remove')?.tone).toBe('remove');

    for (const [key, tone] of [
      ['play', 'play'],
      ['next', 'next'],
      ['stop', 'stop'],
      ['clear', 'clear'],
    ] as const) {
      expect(onBound.find((a) => a.key === key)?.tone, `${key} lost its hover tone`).toBe(tone);
    }

    // REHEARSE/ON PVW deliberately has NO hover tone: it owns the violet `.is-on`
    // fill instead, and a second colour on the same control would fight it.
    expect(onBound.find((a) => a.key === 'rehearse')?.tone).toBeUndefined();
  });

  it('R-022 — only the REHEARSE toggle lights, only while rehearsing', () => {
    const loaded = deps(itemWith('loaded'), true);

    const idle = layerRowActions(loaded);
    expect(idle.find((a) => a.key === 'rehearse')?.active).toBe(false);

    const rehearsing = layerRowActions({ ...loaded, rehearsing: true });
    expect(rehearsing.find((a) => a.key === 'rehearse')?.active).toBe(true);

    // The fill and the WORD read the same flag, so they cannot disagree about
    // which mode the row is in — a lit button labelled REHEARSE would be a lie.
    expect(rehearsing.find((a) => a.key === 'rehearse')?.label).toBe('OFF PVW');

    // NO OTHER VERB lights on a row that is not on air. This is the neutral rule
    // still holding, asserted rather than assumed.
    for (const actions of [idle, rehearsing]) {
      for (const action of actions.filter((a) => a.key !== 'rehearse')) {
        expect(action.active ?? false, `${action.key} must stay neutral`).toBe(false);
      }
    }
  });

  /**
   * PLAY lights GREEN on an on-air row — the second and only other use of the
   * engaged fill. `active` means the same thing for both verbs: the state this
   * verb produces is already true. For REHEARSE that is "rehearsing"; for PLAY it
   * is "on air", which is also exactly why PLAY is disabled there.
   */
  it('PLAY is engaged (and disabled) on an on-air row, and on nothing else', () => {
    const onAir = layerRowActions(deps(itemWith('on-air'), true));
    const play = onAir.find((a) => a.key === 'play');
    expect(play?.active).toBe(true);
    // Lit BECAUSE it cannot be pressed — the two must agree, or the fill would be
    // advertising an action that is on offer.
    expect(play?.disabled).toBe(true);

    // Not on a merely-loaded row.
    expect(
      layerRowActions(deps(itemWith('loaded'), true)).find((a) => a.key === 'play')?.active,
    ).toBe(false);

    // AND NOT ON `unconfirmed`, where the air result is UNKNOWN. Painting the air
    // colour on a guess is what B-087 exists to prevent, and PLAY stays ENABLED
    // there precisely because the take may still be needed.
    const unconfirmed = layerRowActions(deps(itemWith('unconfirmed'), true)).find(
      (a) => a.key === 'play',
    );
    expect(unconfirmed?.active).toBe(false);
    expect(unconfirmed?.disabled).toBe(false);
  });

  it('every menu item is disabled exactly when its declaration is — no second door', () => {
    for (const status of ['idle', 'loaded', 'on-air', 'playing'] as const) {
      const actions = actionsFor(deps(itemWith(status), true));
      const menu = toMenuItems(actions);
      expect(menu).toHaveLength(actions.length);
      // Matched by LABEL rather than by index: the menu may REORDER (REMOVE is
      // rendered last there while its button keeps the fixed first slot), and
      // what this test is about is that no item reaches the menu with a
      // different gate from its declaration.
      for (const action of actions) {
        const item = menu.find((m) => m.label === action.label);
        expect(item, `${status} ${action.label} missing from the menu`).toBeDefined();
        expect(item?.disabled, `${status} ${action.label}`).toBe(action.disabled);
      }
    }
  });

  /**
   * REMOVE is LAST in the menu and FIRST in the button row, deliberately (owner
   * request). The button row's order is fixed by the sticky header printing one
   * word per glyph, so it cannot move; a top-to-bottom menu has no such
   * constraint, and the destructive verb should not be the thing under the
   * cursor the instant the menu opens.
   */
  it('REMOVE renders LAST in the menu while its button keeps the first slot', () => {
    const actions = actionsFor(deps(itemWith('loaded'), true));
    const menuLabels = toMenuItems(actions).map((m) => m.label);
    expect(menuLabels[menuLabels.length - 1]).toBe('REMOVE');

    // The BUTTON row is untouched — the header word above it must still land on it.
    const buttonLabels = actions.filter((a) => a.surface !== 'menu').map((a) => a.label);
    expect(buttonLabels[0]).toBe('REMOVE');

    // Reordering must not lose or duplicate anything.
    expect(menuLabels).toHaveLength(actions.length);
    expect(new Set(menuLabels).size).toBe(menuLabels.length);
  });

  it('R-006 — with the link down the MENU is disabled too, with CLEAR exempt exactly as the button is', () => {
    const actions = actionsFor({ ...deps(itemWith('on-air'), true), linkDown: true });
    for (const item of toMenuItems(actions)) {
      expect(item.disabled, item.label).toBe(true);
    }
    /*
      BOTH SURFACES AGREE — that is what this test is really about, and it is
      unchanged: the row declares each verb once, so CLEAR's gate reaches the
      button and its menu item identically. What flipped is the GATE (see the
      button spec above); the menu followed by construction, not by a second edit.
    */
    const clear = toMenuItems(actions).find((m) => m.label === 'CLEAR');
    expect(clear?.disabled, 'the menu twin carries the same gate as the button').toBe(true);
  });

  it('the menu carries the WHOLE list; buttons are the filtered subset (placement only)', () => {
    const actions = actionsFor(deps(itemWith('on-air'), true));
    const menuLabels = toMenuItems(actions).map((m) => m.label);
    // UPDATE is menu-placed — present in the menu, withheld from the button row
    // so thirty rows do not carry 210 controls.
    expect(menuLabels).toContain('UPDATE');
    const buttonLabels = actions.filter((a) => a.surface !== 'menu').map((a) => a.label);
    expect(buttonLabels).not.toContain('UPDATE');
    // §6 — LOAD FROM LIBRARY is gone from BOTH surfaces. It named a panel R-028
    // deleted, and what it reached (the picker, and R-005's remove inside it) did
    // not go with it: `LOAD` opens the picker now, with importing a `.vcg` as one
    // option in it.
    expect(menuLabels).not.toContain('LOAD FROM LIBRARY');
    expect(buttonLabels).not.toContain('LOAD FROM LIBRARY');
    expect(menuLabels.some((l) => l.includes('LIBRARY'))).toBe(false);
    // …and every button is also in the menu: the menu is a superset, never a
    // separate list.
    for (const label of buttonLabels) expect(menuLabels).toContain(label);
  });

  it('a menu item runs the SAME handler reference as its button', () => {
    const actions = actionsFor(deps(itemWith('on-air'), true));
    const play = actions.find((a) => a.key === 'play');
    const menuPlay = toMenuItems(actions).find((m) => m.label === 'PLAY');
    expect(play).toBeDefined();
    expect(menuPlay).toBeDefined();
    // `toMenuItems` wraps `run` in `runRowAction`, so identity is asserted via
    // the declaration the row holds — one list, one handler.
    expect(actions.filter((a) => a.key === 'play')).toHaveLength(1);
  });

  it('THE SHAPE NEVER CHANGES — every row state declares the same verbs in the same order', () => {
    // `load-remove` is ONE control in ONE position whose label flips (LOAD on an
    // empty row, REMOVE on an occupied one) — the owner's toggle. Its KEY is
    // stable, which is what keeps the shape assertion meaningful.
    // R-022 added `rehearse` as a TOGGLE in a fixed slot (label flips ON PVW /
    // OFF PVW), exactly like `load-remove`: one key, one position, so the shape
    // assertion keeps its meaning and the control never moves under the
    // operator's finger.
    /*
      🔴 **SESSION BR — THIS TEST WAS NARROWER THAN ITS OWN TITLE, AND THE TITLE IS THE
      PROPERTY THE OWNER ASKED FOR.**

      It asserted ONE shape, over four row states × next × linkDown — and every one of those
      was built by a `deps()` that OMITTED `hasLivePlates`. Undefined is falsy, so
      `swap-source` and `plate-audio` could not appear in any of them: the list it pinned was
      the no-live-plates list, and the "the shape never changes" claim was simply never made
      about a row that HAS live plates — which is the row this whole feature exists for.

      Nothing caught it because `apps/runtime`'s typecheck did not include `tests/`. The
      required deps were missing from the object and TypeScript never saw the call.

      So the shape is now asserted for BOTH kinds of row. The property is unchanged and still
      the owner's: a control never moves under the operator's finger. `hasLivePlates` is a
      property of the bound TEMPLATE, so it cannot flip while the operator is looking at the
      row — which is why two fixed shapes, one per kind, is the honest statement of it rather
      than a weakening.
    */
    const BASE = [
      // §6 — 'load-library' is GONE: LOAD opens the picker, so there is no second
      // similarly-named entry point to keep in the shape.
      'load-remove',
      'play',
      'rehearse',
      'next',
      'update',
      'stop',
      'clear',
    ];
    // C-015 — SOURCE and AUDIO are offered together, on a row whose template declares live
    // plates, and they sit BEFORE `next`. Their position is part of the shape.
    const WITH_PLATES = [
      'load-remove',
      'play',
      'rehearse',
      'swap-source',
      'plate-audio',
      'next',
      'update',
      'stop',
      'clear',
    ];
    // Empty, loaded, on air, with and without a next step, link up and down, with and
    // without live plates: the control set is identical every time for a given kind of row.
    // Only `disabled` moves. This is the property the owner asked for after watching NEXT
    // appear and vanish.
    for (const item of [null, itemWith('loaded'), itemWith('on-air'), itemWith('idle')]) {
      for (const hasNext of [true, false]) {
        for (const linkDown of [true, false]) {
          for (const hasLivePlates of [false, true]) {
            const actions = actionsFor({ ...deps(item, hasNext), linkDown, hasLivePlates });
            expect(
              actions.map((a) => a.key),
              `item=${String(item?.status ?? 'empty')} hasNext=${String(hasNext)} linkDown=${String(linkDown)} plates=${String(hasLivePlates)}`,
            ).toEqual(hasLivePlates ? WITH_PLATES : BASE);
          }
        }
      }
    }
  });

  it('on an EMPTY row the load affordances AND CLEAR can act; every other verb is disabled', () => {
    const actions = actionsFor(deps(null, false));
    const toggle = actions.find((a) => a.key === 'load-remove');
    expect(toggle?.label).toBe('LOAD');
    for (const action of actions) {
      // CLEAR joins the load affordances as enabled-on-an-empty-row: it routes to the
      // BANK-SCOPED layer clear, which addresses the LAYER and needs no binding. Every
      // OTHER verb is item-scoped and genuinely has nothing to act on, so those stay
      // disabled — the fixed control set is unchanged, only CLEAR's gate is gone.
      const canAct = action.key === 'load-remove' || action.key === 'clear';
      expect(action.disabled, action.key).toBe(!canAct);
    }
  });

  /**
   * REVERSED, and this is the fix for the owner’s report that LOAD renders dim
   * while the playout server is offline.
   *
   * LOAD was gated on an observably EMPTY layer, so `producer` and `unknown`
   * both refused it — and with CasparCG unreachable every row reads `unknown`,
   * which is exactly when the rundown is being built. The gate existed for the
   * adopt-CLEAR that LOAD no longer issues.
   */
  it('LOAD is ENABLED on an unbound row whatever the wire says about the layer', () => {
    for (const observed of [
      { kind: 'producer' as const, producer: 'html' },
      { kind: 'unknown' as const },
      { kind: 'empty' as const },
    ]) {
      const actions = layerRowActions({ ...deps(null, false), observed });
      expect(
        actions.find((a) => a.key === 'load-remove')?.disabled,
        `occupancy ${observed.kind} must not gate LOAD`,
      ).toBe(false);
    }
  });

  it('the toggle flips to REMOVE once the row is occupied, in the SAME position', () => {
    const emptyActions = actionsFor(deps(null, false));
    const loadedActions = actionsFor(deps(itemWith('loaded'), false));
    // Same index, same key — only the label and the handler change.
    expect(emptyActions[0]?.key).toBe('load-remove');
    expect(loadedActions[0]?.key).toBe('load-remove');
    expect(emptyActions[0]?.label).toBe('LOAD');
    expect(loadedActions[0]?.label).toBe('REMOVE');
  });

  it('declares EVERY verb neutral, so the right-click menu cannot colour them either', () => {
    /*
      The buttons render neutral regardless, but the MENU paints from this
      declaration (`VARIANT_ACCENT`) — so if a verb still declared `play` or `danger`
      here, the menu would be the one surface left colouring affordances. That got
      sharper when on-air became green: a green PLAY menu item would be an affordance
      wearing the one colour reserved for "this is on the output".
    */
    for (const action of [
      ...actionsFor(deps(null, false)),
      ...actionsFor(deps(itemWith('on-air'), false)),
    ]) {
      expect(action.variant, `${action.label} must be neutral`).toBe('verb');
    }
  });
});

describe('LayerRow — slot/binding shape', () => {
  it('a row whose binding names a departed item renders as empty, never as a ghost', async () => {
    // The bridge publishes the binding and the stack separately; if the item is
    // gone the row must not keep naming it.
    rendered = await renderLayerRow({
      item: null,
      template: null,
      slot: slotWith({
        binding: { itemId: 'gone', templateType: 'clock' },
        observed: { kind: 'empty' },
      }),
    });
    const buttons = rendered.buttons();
    expect(buttons.get('LOAD')).toBe(false);
    expect(buttons.get('PLAY')).toBe(true);
  });

  /**
   * REVERSED: LOAD is ENABLED on an unbound row that is showing a producer.
   *
   * It used to be refused because the load chain adopt-CLEARed the layer before
   * its `CG ADD`, so one un-gated click could destroy a graphic that survived a
   * bridge restart. LOAD emits ZERO AMCP now — it binds a template to OUR list
   * and touches no layer — so there is nothing to destroy and nothing to gate.
   * PLAY is the only path to a layer, and it is where that care belongs.
   */
  it('an unbound row showing a producer still accepts LOAD — LOAD touches no layer', async () => {
    rendered = await renderLayerRow({
      item: null,
      template: null,
      slot: slotWith({ binding: null, observed: { kind: 'producer', producer: 'html' } }),
    });
    expect(rendered.buttons().get('LOAD')).toBe(false);
  });
});

/**
 * Owner request: clicking a layer row is a TOGGLE — clicking the selected row again
 * deselects it.
 *
 * This also settles a contradiction the row already carried: it renders
 * `aria-pressed={selected}`, which announces a toggle to assistive tech, while a
 * second click used to do nothing.
 */
describe('LayerRow — click is TOGGLE select', () => {
  const clickRow = (el: HTMLElement): void => {
    const row = el.querySelector<HTMLElement>('.cg-row');
    if (row === null) throw new Error('row element missing');
    row.click();
  };

  it('an UNSELECTED row with an item reports that item on click', async () => {
    const seen: (string | null)[] = [];
    rendered = await renderLayerRow({
      item: itemWith('loaded'),
      selected: false,
      onSelect: (id) => seen.push(id),
    });
    clickRow(rendered.container);
    expect(seen).toEqual([itemWith('loaded').itemId]);
  });

  it('a SELECTED row reports null on click — the toggle, and the whole request', async () => {
    const seen: (string | null)[] = [];
    rendered = await renderLayerRow({
      item: itemWith('loaded'),
      selected: true,
      onSelect: (id) => seen.push(id),
    });
    clickRow(rendered.container);
    expect(seen).toEqual([null]);
  });

  it('an on-air row toggles too — deselecting never touches air, it only closes the editor', async () => {
    const seen: (string | null)[] = [];
    rendered = await renderLayerRow({
      item: itemWith('on-air'),
      selected: true,
      onSelect: (id) => seen.push(id),
    });
    clickRow(rendered.container);
    expect(seen).toEqual([null]);
  });

  it('an EMPTY row reports null whether or not it reads selected — there is nothing to select', async () => {
    for (const selected of [false, true]) {
      const seen: (string | null)[] = [];
      rendered = await renderLayerRow({
        item: null,
        template: null,
        selected,
        onSelect: (id) => seen.push(id),
      });
      clickRow(rendered.container);
      expect(seen, `selected=${String(selected)}`).toEqual([null]);
      // Unmount BETWEEN iterations, not just in `afterEach`: two mounted rows would
      // both answer `.cg-row`, so the second click could land on the first row's
      // element and the assertion would pass for the wrong reason.
      await rendered.unmount();
      rendered = null;
    }
  });

  it('the row announces itself as a toggle (aria-pressed tracks selection)', async () => {
    rendered = await renderLayerRow({ item: itemWith('loaded'), selected: true });
    expect(rendered.container.querySelector('.cg-row')?.getAttribute('aria-pressed')).toBe('true');
  });
});

/**
 * THE LOAD/REMOVE TOGGLE, once BINDING and OCCUPANCY are separate facts.
 *
 * The reported defect: after CLEAR the item survives and the producer does not,
 * so a flag meaning `item === null` answered "is a template bound?" for a control
 * whose real question is "is the LAYER empty?". The toggle went on showing REMOVE
 * and the operator had to remove-and-re-pick to get the same graphic back.
 *
 * Asserted on the RESOLVED VERB (the action's `key` + `label` + which handler it
 * calls), never on rendered text.
 */
describe('LayerRow — the LOAD/REMOVE toggle splits binding from occupancy', () => {
  const observedEmpty = { kind: 'empty' as const };
  const observedProducer = { kind: 'producer' as const, producer: 'html' };
  const observedUnknown = { kind: 'unknown' as const };

  /**
   * The toggle for one row. A spec still says which ITEM the row holds — `null`
   * meaning UNBOUND — and `bindingFor` turns that into the union the verbs read.
   * A spec about the `awaiting` window passes `binding` directly instead.
   */
  function toggle(
    over: Partial<Omit<Parameters<typeof layerRowActions>[0], 'binding'>> & {
      item?: StackItemState | null;
      binding?: Parameters<typeof layerRowActions>[0]['binding'];
    },
  ) {
    const { item, ...rest } = over;
    const actions = layerRowActions({
      ...rowDeps({
        binding: over.binding ?? bindingFor(item === undefined ? itemWith('loaded') : item),
        observed: observedEmpty,
        dirty: false,
      }),
      ...rest,
    });
    const action = actions.find((a) => a.key === 'load-remove');
    if (action === undefined) throw new Error('the toggle must always exist');
    return action;
  }

  it('NO binding + EMPTY layer → LOAD', () => {
    const t = toggle({ item: null, observed: observedEmpty });
    expect(t.label).toBe('LOAD');
    expect(t.disabled).toBe(false);
  });

  it('binding + OCCUPIED layer → REMOVE', () => {
    expect(toggle({ observed: observedProducer }).label).toBe('REMOVE');
  });

  /**
   * REVERSED FROM THE PREVIOUS TASK, DELIBERATELY.
   *
   * This used to assert LOAD + a re-ADD after CLEAR. The toggle is decided by
   * the BINDING alone now: CLEAR empties the layer, the binding survives, and
   * the row goes on offering the way out. Nothing needs re-loading because PLAY
   * re-ADDs on its way to air.
   */
  it('binding + EMPTY layer (post-CLEAR) → still REMOVE, never LOAD', () => {
    const t = toggle({ observed: observedEmpty });
    expect(t.label).toBe('REMOVE');
    expect(t.tone).toBe('remove');
  });
  it('binding + EMPTY layer + template MISSING → REMOVE, and it says why', () => {
    const t = toggle({ observed: observedEmpty, templateAvailable: false });
    expect(t.label).toBe('REMOVE');
    // The row must be able to UNBIND, or it is stranded: it cannot load (no
    // template) and could not remove (the toggle showed LOAD).
    expect(t.disabled).toBe(false);
    // …and it states the reason rather than leaving the operator to guess why
    // the row cannot be put back.
    expect(t.title).toBe(MISSING_TEMPLATE_REASON);
    // §6 — the fact is the same; the word "library" is not, because it named a
    // panel R-028 deleted and sent the operator looking for a surface that is
    // not there.
    expect(t.title).toMatch(/this browser does not have/i);
    expect(t.title).not.toMatch(/library/i);
  });

  /**
   * UNKNOWN occupancy shows REMOVE, fail-closed. A re-ADD onto a layer we cannot
   * vouch for would issue an adopt-CLEAR against a graphic nobody has claimed,
   * and OSC silence is not evidence of an empty layer (B-101).
   */
  it('binding + UNKNOWN occupancy → REMOVE, never a speculative re-ADD', () => {
    expect(toggle({ observed: observedUnknown }).label).toBe('REMOVE');
  });

  /**
   * THE PVW GUARD ON LOAD IS GONE, and its absence is asserted rather than
   * merely unmentioned: LOAD emits zero AMCP, so it cannot put an unmuted
   * producer under a row that is on PVW. A guard that protects nothing would
   * only refuse a load the operator is entitled to.
   */
  it('LOAD is NOT refused by PVW — it cannot reach a layer at all', () => {
    const t = toggle({ item: null, observed: observedEmpty, rehearsing: true });
    expect(t.label).toBe('LOAD');
    expect(t.disabled).toBe(false);
  });

  /**
   * AND LOAD IS NOT GATED ON LAYER OCCUPANCY — the owner’s report that LOAD
   * renders dim while the playout server is offline. With CasparCG unreachable
   * the occupancy is `unknown`, which is exactly when the rundown is being
   * built. LOAD needs the BRIDGE, never CasparCG.
   */
  it('LOAD is ENABLED on an unbound row whatever the layer says', () => {
    for (const observed of [observedEmpty, observedProducer, observedUnknown]) {
      const t = toggle({ item: null, observed });
      expect(t.label).toBe('LOAD');
      expect(t.disabled, `occupancy ${observed.kind} must not gate LOAD`).toBe(false);
    }
  });
  /** An UNBOUND row is unaffected by rehearse: there is nothing rehearsing on it. */
  it('an unbound row is not refused by the PVW guard', () => {
    expect(toggle({ item: null, observed: observedEmpty, rehearsing: true }).disabled).toBe(false);
  });

  /** The shape never changes: one key, one slot, in every one of these states. */
  it('is ONE key in ONE position across every combination above', () => {
    for (const item of [null, itemWith('loaded')]) {
      for (const observed of [observedEmpty, observedProducer, observedUnknown]) {
        for (const templateAvailable of [true, false]) {
          const t = toggle({ item, observed, templateAvailable });
          expect(t.key).toBe('load-remove');
          expect(['LOAD', 'REMOVE']).toContain(t.label);
        }
      }
    }
  });
});

/**
 * §1/§2 — THE VERBS THAT NEED CASPARCG ARE DISABLED WHILE IT IS UNREACHABLE.
 *
 * The bridge already refuses these — `update()` answers `disconnected`, `take()`
 * the same — so nothing here makes the system safer. What it fixes is the
 * CONTROL: they were enabled, sent nothing on click, and reported an error
 * afterwards, which costs the operator the seconds in which he believes the
 * command is on its way. The refusal was always right; the button was not.
 */
describe('LayerRow — CasparCG reachability gates the AMCP verbs', () => {
  /** A row's deps, both hops up, with an OCCUPIED layer unless stated. */
  const deps = (
    item: StackItemState | null,
    hasNext: boolean,
  ): Parameters<typeof layerRowActions>[0] =>
    rowDeps({ binding: bindingFor(item), hasNext, dirty: true });
  const onAirRow = () => ({
    ...deps(itemWith('on-air'), true),
    casparReach: 'unreachable' as const,
  });

  /**
   * ASSERTED ACROSS BOTH UNREACHABLE STATES, because they must behave
   * identically and a spec that checked only the first would pass while the
   * second silently enabled a verb on no evidence at all. `casparReachable` is
   * false for a KNOWN-down server and for an UNKNOWN one alike — the hook folds
   * them together precisely so this cannot diverge.
   */
  it('disables PLAY, NEXT, STOP, UPDATE and CLEAR — with the reason on the control', () => {
    const actions = layerRowActions(onAirRow());
    for (const key of ['play', 'next', 'stop', 'update', 'clear']) {
      const a = actions.find((x) => x.key === key);
      expect(a?.disabled, `${key} must be disabled while CasparCG is unreachable`).toBe(true);
      // THE REASON, not merely the refusal — a disabled button and a broken
      // button look identical to a test that only asserts nothing was sent.
      expect(a?.title, `${key} must say WHY`).toMatch(/CasparCG cannot be reached/i);
    }
  });

  /**
   * IT NAMES THE RIGHT HOP. "Bridge disconnected" while the bridge is fine would
   * send the operator to the wrong machine, so the two states get two sentences
   * and `linkDown` wins when both are down (it is the nearer failure, and with it
   * down CasparCG's state is not even knowable).
   */
  it('names the BRIDGE when the bridge is what is down', () => {
    const actions = layerRowActions({ ...onAirRow(), linkDown: true });
    const play = actions.find((x) => x.key === 'play');
    expect(play?.title).toMatch(/Bridge disconnected/i);
    expect(play?.title).not.toMatch(/CasparCG cannot be reached/i);
  });

  /**
   * THE HALF THAT STOPS §1 OVER-REACHING, and the half that gets left out.
   *
   * LOAD binds a template to OUR LIST and emits zero AMCP; ON PVW is local
   * preview and sends nothing to the layer. Gating either on CasparCG would take
   * away exactly what the operator needs while the playout machine is off — and
   * would undo two changes that just landed.
   */
  it('leaves LOAD and ON PVW alone — they never touch the layer', () => {
    const unbound = layerRowActions({ ...deps(null, false), casparReach: 'unreachable' as const });
    const load = unbound.find((a) => a.key === 'load-remove');
    expect(load?.label).toBe('LOAD');
    expect(load?.disabled, 'LOAD needs the bridge, never CasparCG').toBe(false);

    const bound = layerRowActions({
      ...deps(itemWith('loaded'), true),
      casparReach: 'unreachable' as const,
    });
    expect(
      bound.find((a) => a.key === 'rehearse')?.disabled,
      'ON PVW is local preview and sends nothing',
    ).toBe(false);
    // …and REMOVE is a list action too: it unbinds, it does not command a layer.
    expect(bound.find((a) => a.key === 'load-remove')?.label).toBe('REMOVE');
  });

  /** Everything returns the instant CasparCG does — this is a gate, not a removal. */
  it('re-enables every gated verb once CasparCG is reachable again', () => {
    const actions = layerRowActions({
      ...deps(itemWith('on-air'), true),
      casparReach: 'reachable' as const,
    });
    for (const key of ['play', 'next', 'stop', 'clear']) {
      const a = actions.find((x) => x.key === key);
      expect(a?.title ?? '', `${key} must drop the reason`).not.toMatch(/cannot be reached/i);
    }
    expect(actions.find((x) => x.key === 'stop')?.disabled).toBe(false);
    expect(actions.find((x) => x.key === 'clear')?.disabled).toBe(false);
  });
});

/**
 * `add-multibox-audio` — **THE ROW'S READ-ONLY AUDIO SUMMARY, AND THE INVARIANT IT MUST NOT
 * TOUCH.**
 *
 * A row carries a VARIABLE number of live plates while the verb block is a FIXED six-column
 * grid whose sticky header prints the word above each glyph. A conditional control inside that
 * block would put every header word from its column rightward above the WRONG glyph — and this
 * product's STOP (graceful) and CLEAR (hard kill) are the inverse of the reference product's,
 * so the header word is precisely the channel that retires the misread. The summary therefore
 * rides the ALIAS cell, adds no column, and is not pressable.
 */
describe('LayerRow — the live-plate audio summary', () => {
  let rendered: Awaited<ReturnType<typeof renderLayerRow>> | null = null;

  afterEach(async () => {
    await rendered?.unmount();
    rendered = null;
  });

  const summary = (el: HTMLElement): Element | null => el.querySelector('[data-audio-summary]');

  it('counts the RAISED plates against the plates the row owns', async () => {
    rendered = await renderLayerRow({
      item: itemWith('on-air', { plateVolumes: { 'guest-1': 1, 'guest-2': 0 } }),
      seatedPlates: ['guest-1', 'guest-2', 'guest-3', 'guest-4'],
    });
    expect(summary(rendered.container)?.textContent).toBe('audio 1/4');
  });

  it('🔴 an explicit 0 is NOT raised, and neither is an absent key — but they are not merged', async () => {
    // Zero is falsy and this repo has paid for that three times. Both read as not-raised
    // here; what must not happen is either of them counting as raised.
    rendered = await renderLayerRow({
      item: itemWith('on-air', { plateVolumes: { 'guest-1': 0 } }),
      seatedPlates: ['guest-1', 'guest-2'],
    });
    expect(summary(rendered.container)?.textContent).toBe('audio 0/2');
  });

  it('a row that owns NO live plates shows no summary at all — never `audio 0/0`', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air'), seatedPlates: [] });
    expect(summary(rendered.container)).toBeNull();
  });

  it('🔴 the verb block still holds exactly SIX buttons, and the summary is not one of them', async () => {
    rendered = await renderLayerRow({
      item: itemWith('on-air', { plateVolumes: { 'guest-1': 1 } }),
      seatedPlates: ['guest-1', 'guest-2'],
    });
    const block = rendered.container.querySelector('[data-verb-block]');
    expect(block?.querySelectorAll('button')).toHaveLength(VERB_COUNT);
    expect(block?.querySelector('[data-audio-summary]'), 'it is OUTSIDE the grid').toBeNull();
  });

  it('it is READ-ONLY — no button, no input, and the pointer does not promise one', async () => {
    rendered = await renderLayerRow({
      item: itemWith('on-air', { plateVolumes: { 'guest-1': 1 } }),
      seatedPlates: ['guest-1', 'guest-2'],
    });
    const chip = summary(rendered.container);
    expect(chip?.tagName).toBe('SPAN');
    expect(chip?.querySelector('button, input')).toBeNull();
  });

  it('🔴 nothing about it is drawn as a METER', async () => {
    // There is no per-input level to draw: CasparCG's programme channel reports ONE peak pair
    // for the whole channel. A bar here would claim "sound is present" from data that only
    // says "we asked for it".
    rendered = await renderLayerRow({
      item: itemWith('on-air', { plateVolumes: { 'guest-1': 1 } }),
      seatedPlates: ['guest-1', 'guest-2'],
    });
    expect(rendered.container.querySelector('meter, progress, [role="progressbar"]')).toBeNull();
  });
});

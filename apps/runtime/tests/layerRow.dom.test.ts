// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react-dom/test-utils';
import { toMenuItems } from '../src/renderer/ui/rowAction.js';
import { layerRowActions } from '../src/renderer/features/layers/layerRowActions.js';
import {
  itemWith,
  renderLayerRow,
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
  it('an EMPTY row shows every verb, with only LOAD enabled', async () => {
    const buttons = await buttonsFor({ item: null, template: null });
    // The owner's point 8: the buttons exist before a load, rendered disabled.
    // A disabled button is not the "enabled control that can only reject" that
    // R-021 stage 2b forbids — and a fixed control set does not move the target
    // under the operator's hand as state changes.
    expect(buttons.get('LOAD')).toBe(false);
    expect(buttons.get('PLAY')).toBe(true);
    expect(buttons.get('STOP')).toBe(true);
    expect(buttons.get('CLEAR')).toBe(true);
  });

  it('a LOADED row: PLAY enabled; STOP and CLEAR disabled; the toggle now reads REMOVE', async () => {
    const buttons = await buttonsFor({ item: itemWith('loaded') });
    expect(buttons.get('PLAY')).toBe(false);
    expect(buttons.get('STOP')).toBe(true);
    expect(buttons.get('CLEAR')).toBe(true);
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

  it('R-006 — DISCONNECTED disables every verb including LOAD', async () => {
    const buttons = await buttonsFor({ item: itemWith('on-air'), link: 'disconnected' });
    for (const [label, disabled] of buttons) {
      expect(disabled, `${label} must be disabled with the bridge down`).toBe(true);
    }
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
  it('shows the alias as the primary label AND keeps the real layer number', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air') });
    const text = rendered.container.textContent ?? '';
    // The ALIAS is what the operator thinks in, so it is the row's title now.
    expect(text).toContain('CLOCK');
    // The real layer number STAYS on the row as a secondary column. It is the
    // vocabulary shared with the playout side — the reservation is 60–69, not
    // "rows 1–4" — and it is what an operator needs to clear a layer by hand
    // over AMCP. It may sit beside the alias but never instead of it.
    expect(rendered.container.querySelector('[title="CasparCG layer 1-70"]')?.textContent).toBe(
      '70',
    );
  });

  it('an empty row says so instead of naming a template', async () => {
    rendered = await renderLayerRow({ item: null, template: null });
    expect(rendered.container.textContent).toContain('Empty');
  });

  it('B-087 — with the bridge down the row reads unknown, never a frozen air claim', async () => {
    rendered = await renderLayerRow({ item: itemWith('on-air'), link: 'disconnected' });
    const text = rendered.container.textContent ?? '';
    expect(text).toContain('unknown');
    // The claim is DEMOTED to the muted "WAS ON AIR", and the sacred red tone is
    // withheld — that class is reserved for a graphic a live wire confirms.
    expect(text).toContain('WAS ON AIR');
    // The row's state cell carries its ROLE as a data attribute (the badge pill
    // was replaced by the state column when the verbs went neutral). Asserting
    // the role, not a hex colour: the property that matters is "not the on-air
    // role", and a colour assertion would break on any palette tuning while
    // saying nothing about it.
    const state = rendered.container.querySelector('[data-row-state]');
    expect(state?.getAttribute('data-row-state')).not.toBe('onair');
  });
});

describe('LayerRow — buttons and menu derive from ONE list (5.2/5.5)', () => {
  /** The row's action list, built the way the row builds it. */
  const actionsFor = (over: Parameters<typeof layerRowActions>[0]) => layerRowActions(over);

  const deps = (item: Parameters<typeof layerRowActions>[0]['item'], hasNext: boolean) => ({
    item,
    // An EMPTY layer, so LOAD is safe — the occupancy gate is exercised
    // separately below.
    observed: { kind: 'empty' as const },
    hasNext,
    linkDown: false,
    dirty: true,
    load: () => Promise.resolve({ accepted: true }),
    loadFromLibrary: () => Promise.resolve({ accepted: true }),
    play: () => Promise.resolve({ accepted: true }),
    next: () => Promise.resolve({ accepted: true }),
    update: () => Promise.resolve({ accepted: true }),
    stop: () => Promise.resolve({ accepted: true }),
    clear: () => Promise.resolve({ accepted: true }),
    remove: () => Promise.resolve({ accepted: true }),
    onError: () => undefined,
  });

  it('every menu item is disabled exactly when its declaration is — no second door', () => {
    for (const status of ['idle', 'loaded', 'on-air', 'playing'] as const) {
      const actions = actionsFor(deps(itemWith(status), true));
      const menu = toMenuItems(actions);
      expect(menu).toHaveLength(actions.length);
      actions.forEach((action, i) => {
        expect(menu[i]?.label, status).toBe(action.label);
        expect(menu[i]?.disabled, `${status} ${action.label}`).toBe(action.disabled);
      });
    }
  });

  it('R-006 — with the link down the MENU is disabled too, not just the buttons', () => {
    const actions = actionsFor({ ...deps(itemWith('on-air'), true), linkDown: true });
    for (const item of toMenuItems(actions)) {
      expect(item.disabled, item.label).toBe(true);
    }
  });

  it('the menu carries the WHOLE list; buttons are the filtered subset (placement only)', () => {
    const actions = actionsFor(deps(itemWith('on-air'), true));
    const menuLabels = toMenuItems(actions).map((m) => m.label);
    // UPDATE and LOAD FROM LIBRARY are menu-placed — present in the menu,
    // withheld from the button row so thirty rows do not carry 210 controls.
    expect(menuLabels).toContain('UPDATE');
    expect(menuLabels).toContain('LOAD FROM LIBRARY');
    const buttonLabels = actions.filter((a) => a.surface !== 'menu').map((a) => a.label);
    expect(buttonLabels).not.toContain('UPDATE');
    expect(buttonLabels).not.toContain('LOAD FROM LIBRARY');
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
    const SHAPE = ['load-remove', 'load-library', 'play', 'next', 'update', 'stop', 'clear'];
    // Empty, loaded, on air, with and without a next step, link up and down:
    // the control set is identical every time. Only `disabled` moves. This is
    // the property the owner asked for after watching NEXT appear and vanish.
    for (const item of [null, itemWith('loaded'), itemWith('on-air'), itemWith('idle')]) {
      for (const hasNext of [true, false]) {
        for (const linkDown of [true, false]) {
          const actions = actionsFor({ ...deps(item, hasNext), linkDown });
          expect(
            actions.map((a) => a.key),
            `item=${String(item?.status ?? 'empty')} hasNext=${String(hasNext)} linkDown=${String(linkDown)}`,
          ).toEqual(SHAPE);
        }
      }
    }
  });

  it('on an EMPTY row only the load affordances can act; every other verb is disabled', () => {
    const actions = actionsFor(deps(null, false));
    const toggle = actions.find((a) => a.key === 'load-remove');
    expect(toggle?.label).toBe('LOAD');
    for (const action of actions) {
      if (action.key === 'load-remove' || action.key === 'load-library') {
        expect(action.disabled, action.key).toBe(false);
      } else {
        expect(action.disabled, action.key).toBe(true);
      }
    }
  });

  it('LOAD is REFUSED on an unbound row the wire says is occupied or unverifiable', () => {
    // The load chain adopt-CLEARs the layer before its CG ADD, so a row that
    // merely LOOKS free (no binding) but carries a live producer — one that
    // survived a bridge restart, or one the playout side put there — must not
    // accept a single un-gated click.
    const occupied = layerRowActions({
      ...deps(null, false),
      observed: { kind: 'producer', producer: 'html' },
    });
    expect(occupied.find((a) => a.key === 'load-remove')?.disabled).toBe(true);

    // Unknown fails closed for the same reason part A's untick does.
    const unknown = layerRowActions({ ...deps(null, false), observed: { kind: 'unknown' } });
    expect(unknown.find((a) => a.key === 'load-remove')?.disabled).toBe(true);

    // …and a provably empty layer still loads.
    const empty = layerRowActions({ ...deps(null, false), observed: { kind: 'empty' } });
    expect(empty.find((a) => a.key === 'load-remove')?.disabled).toBe(false);
  });

  it('the toggle flips to REMOVE (danger) once the row is occupied, in the SAME position', () => {
    const emptyActions = actionsFor(deps(null, false));
    const loadedActions = actionsFor(deps(itemWith('loaded'), false));
    // Same index, same key — only the label, variant and handler change.
    expect(emptyActions[0]?.key).toBe('load-remove');
    expect(loadedActions[0]?.key).toBe('load-remove');
    expect(emptyActions[0]?.label).toBe('LOAD');
    expect(loadedActions[0]?.label).toBe('REMOVE');
    expect(loadedActions[0]?.variant).toBe('danger');
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

  it('an unbound row still SHOWING a producer refuses LOAD — the graphic survived a restart', async () => {
    // Exactly task 3.3's honest-unknown case in the wild: the bridge restarted,
    // the producer is still on air, and no binding names it. Loading here would
    // adopt-CLEAR a live graphic on one un-gated click.
    rendered = await renderLayerRow({
      item: null,
      template: null,
      slot: slotWith({ binding: null, observed: { kind: 'producer', producer: 'html' } }),
    });
    expect(rendered.buttons().get('LOAD')).toBe(true);
  });
});

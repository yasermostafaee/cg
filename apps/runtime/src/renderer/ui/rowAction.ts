import type { LucideIcon } from 'lucide-react';
import type { ButtonVariant } from './Button.js';
import type { ContextMenuItem } from './ContextMenu.js';
import {
  asyncRejectionMessage,
  asyncResultMessage,
  type AsyncResult,
} from './asyncButtonController.js';
import { reportCommandError } from '../features/status/commandFeedback.js';

/**
 * One operator action on a row, declared ONCE and rendered TWICE — as a button
 * and as a right-click menu item.
 *
 * The right-click menu is an ALTERNATE ENTRY POINT to actions that already exist,
 * never a new capability. That has to hold for the gating as much as the handler:
 * a stack row's PLAY/UPDATE/CLEAR/REMOVE are refused while the bridge link is down
 * (R-006), and a menu that let the operator issue them anyway would be a second,
 * UNGUARDED door onto air.
 *
 * Declaring the action once is what makes that structural rather than a
 * coincidence two code paths have to keep agreeing on. The row builds this list,
 * renders an `AsyncButton` per entry, and hands the SAME list to the menu — so a
 * menu item is enabled exactly when its button is, and runs exactly what its
 * button runs, by construction.
 */
export interface RowAction {
  /** Stable identity for tests and React keys (the label is display text). */
  key: string;
  label: string;
  variant: ButtonVariant;
  disabled: boolean;
  /** The button's tooltip — usually WHY it is disabled. */
  title?: string | undefined;
  /** The shared handler. Identical reference for the button and the menu item. */
  run: () => Promise<AsyncResult>;
  /**
   * Where a refusal goes. Every row action routes to the command TOAST rather
   * than pinning a message inline (which wrapped and bloated tight rows).
   * A no-op here means the handler already reports for itself — the Inspector's
   * `applyDraft` does — and a second report would double-toast.
   */
  onError: (message: string) => void;
  /**
   * R-028 (5.2) — WHERE this action appears. `'button'` (the default) renders a
   * button AND a menu item; `'menu'` renders the menu item only.
   *
   * PLACEMENT ONLY. It is deliberately one optional field on the SINGLE
   * declaration rather than a second "menu-only actions" array, because the
   * array is exactly the drift this module exists to prevent: two lists mean two
   * gates, two handlers and two wordings to keep agreeing. `toMenuItems` still
   * receives the WHOLE list, so a menu-placed action is gated and handled by the
   * same declaration as any other — only its button is withheld.
   *
   * Why any action is menu-placed at all: seven verbs across thirty rows is 210
   * controls if every verb is a button. The row shows the ones an operator
   * reaches for under time pressure and files the rest one right-click away.
   */
  surface?: 'button' | 'menu' | undefined;
  /**
   * R-028 part B — the lucide glyph shown BESIDE the label (never instead of
   * it). Declared here with everything else so a verb's icon cannot differ
   * between its button and its menu item.
   *
   * The word always stays: this product's STOP and CLEAR mean the opposite of
   * the reference product's, so an operator must never have to decode a symbol
   * to know which one they are about to press.
   */
  icon?: LucideIcon | undefined;
  /**
   * R-022 — this action is a TOGGLE and its mode is currently ENGAGED. Renders the
   * button filled in that mode's hue (`.is-on`, `controls.css`).
   *
   * Declared HERE with the label, the icon and the variant for the reason the rest
   * of this interface exists: the row's button and its right-click twin are built
   * from one declaration, so a lit toggle cannot end up lit in one surface and
   * plain in the other. Absent/false is the ordinary case.
   */
  active?: boolean | undefined;
  /**
   * Which verb this is, for the HOVER fill (`--r-verb-*`, `controls.css`). Hover
   * only — the verb rests neutral.
   *
   * Its own field rather than a reuse of `key`, because LOAD and REMOVE share one
   * key and one slot (the toggle) and need different colours; deriving the tone
   * from the key would have made the CSS guess which half is showing, and
   * deriving it from the LABEL would key a colour off display text.
   */
  tone?: VerbTone | undefined;
  /**
   * Render this action LAST in the context menu, whatever its place in the array.
   *
   * MENU-ONLY, and that is the whole point: the button row's order is fixed by the
   * sticky column header printing a word per glyph, so it cannot move. REMOVE is
   * the one action that wants a different place in each — first in the fixed
   * LOAD/REMOVE slot, last in a top-to-bottom list where whatever sits at the top
   * is under the cursor the instant the menu opens.
   */
  menuLast?: boolean | undefined;
}

/**
 * The verbs that own a hover colour. Deliberately a closed set: a new verb gets a
 * colour by being added here and to `--r-verb-*`, not by a caller inventing a
 * string that silently matches no CSS rule.
 */
export type VerbTone = 'load' | 'remove' | 'play' | 'next' | 'stop' | 'clear';

/**
 * The actions that get a BUTTON — the one place the placement hint is read, so
 * "default is button" cannot drift between rows.
 */
export function buttonActions(actions: readonly RowAction[]): RowAction[] {
  return actions.filter((a) => a.surface !== 'menu');
}

/**
 * Run an action the way its BUTTON would.
 *
 * `AsyncButton` gets its press/busy/success feedback from the button itself, which
 * a menu item has nowhere to show — but the part that matters for correctness is
 * the FAILURE path, and that is shared verbatim (`asyncResultMessage` /
 * `asyncRejectionMessage` are the same functions `AsyncButtonController` uses).
 * So the same refusal produces the same words whichever way it was issued.
 */
export function runRowAction(action: RowAction): void {
  if (action.disabled) return; // belt and braces: a disabled item is already inert
  action.run().then(
    (res) => {
      const message = asyncResultMessage(res);
      if (message !== null) action.onError(message);
    },
    (err: unknown) => action.onError(asyncRejectionMessage(err)),
  );
}

/**
 * Attach a CONFIRM gate to an action at DECLARATION time — the single place a
 * confirmation is wired, so it cannot exist on one surface and not the other.
 *
 * The returned action's `run` awaits `confirm` first and short-circuits on a
 * cancel with `{ accepted: false, cancelled: true }`: not a success (nothing
 * ran, so no success flash) and not an error (the operator's own "no" is not a
 * refusal to report — `asyncResultMessage` returns null for it). Because the
 * row maps its action list through this ONCE and hands the SAME wrapped list to
 * its buttons and to `toMenuItems`, the button and the menu item share the gate
 * by construction — a confirm bolted onto the button's onClick instead would be
 * exactly the second-unguarded-door drift this module exists to prevent.
 */
export function withConfirm(action: RowAction, confirm: () => Promise<boolean>): RowAction {
  return {
    ...action,
    run: async () => {
      const ok = await confirm();
      if (!ok) return { accepted: false, cancelled: true };
      return action.run();
    },
  };
}

/**
 * Project the row's actions into menu items, preserving gate, handler and wording.
 *
 * MENU ORDER IS NOT BUTTON ORDER, and the two must be allowed to differ. The
 * BUTTON row's order is load-bearing — the sticky column header prints one word
 * per verb above its glyph, so reordering the array would slide every head onto
 * the wrong button. The menu has no header and reads top-to-bottom as a list, so
 * a destructive verb at the top is a destructive verb under the cursor the moment
 * the menu opens.
 *
 * `menuLast` therefore moves an action DOWN in this projection only, leaving the
 * array — and the buttons — untouched. Stable within each group, so everything
 * else keeps its declared order.
 */
export function toMenuItems(actions: readonly RowAction[]): ContextMenuItem[] {
  const ordered = [
    ...actions.filter((a) => a.menuLast !== true),
    ...actions.filter((a) => a.menuLast === true),
  ];
  return ordered.map((action) => ({
    label: action.label,
    // The button's OWN variant, passed through untouched. It used to be squashed
    // through a menu-local `default | caution | danger` mapping with its own colour
    // values, which made the menu a THIRD palette that half-matched the buttons —
    // PLAY and UPDATE both fell to `default`, and danger used a different red. The
    // menu now resolves colour from the same `VARIANT_ACCENT` the buttons do, so a
    // menu item cannot be a different colour from the control it mirrors.
    variant: action.variant,
    disabled: action.disabled,
    ...(action.title !== undefined ? { title: action.title } : {}),
    ...(action.icon !== undefined ? { icon: action.icon } : {}),
    onSelect: () => runRowAction(action),
  }));
}

/**
 * The default failure sink for a row action: the command toast. Named so a row
 * can be explicit about routing rather than relying on a default two files away.
 */
export const toastOnError = reportCommandError;

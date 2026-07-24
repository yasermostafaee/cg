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

/** Project the row's actions into menu items, preserving gate, handler and wording. */
export function toMenuItems(actions: readonly RowAction[]): ContextMenuItem[] {
  return actions.map((action) => ({
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
    onSelect: () => runRowAction(action),
  }));
}

/**
 * The default failure sink for a row action: the command toast. Named so a row
 * can be explicit about routing rather than relying on a default two files away.
 */
export const toastOnError = reportCommandError;

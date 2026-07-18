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

/** Menu colouring follows the button's variant, so the two read as one control. */
function menuVariant(variant: ButtonVariant): NonNullable<ContextMenuItem['variant']> {
  if (variant === 'danger') return 'danger';
  if (variant === 'caution') return 'caution';
  return 'default';
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

/** Project the row's actions into menu items, preserving gate, handler and wording. */
export function toMenuItems(actions: readonly RowAction[]): ContextMenuItem[] {
  return actions.map((action) => ({
    label: action.label,
    variant: menuVariant(action.variant),
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

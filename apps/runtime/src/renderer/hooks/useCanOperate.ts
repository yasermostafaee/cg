import { holdsPermissionClass } from '@cg/shared-ipc';
import { useSelectedChannel } from '../features/channels/useSelectedChannel.js';
import { useAuthSession } from './useAuthSession.js';

/**
 * 🔴 `C-038` / `R-066` bullet 4 — **MAY THIS PRINCIPAL ACT ON THE CHANNEL THE CONSOLE IS
 * SCOPED TO? The ONE console-side answer.**
 *
 * ── WHY IT IS ONE HOOK AND NOT A CHECK PER SURFACE ──────────────────────────
 *
 * Golden rule 6. Every operator control asks THIS, so a control that renders and a command
 * the bridge accepts are the same judgement. A surface deriving its own answer from
 * `principal.roles` would agree today and drift the first time the rule moves — and the
 * failure mode is the one `R-066` bullet 4 exists to remove: a control the operator can press
 * that the bridge then refuses.
 *
 * ⚠ **IT ASKS `holdsPermissionClass`, the SAME function the bridge's gate asks.** Not a local
 * `roles.includes('operator')`: that would be a second copy of the hierarchy, and a
 * `station-admin` would silently lose every operator control the day the Playout stopped
 * sending cumulative roles. One predicate, two callers, one meaning.
 *
 * ── THE TWO PERMISSIVE CASES, AND WHY THEY ARE NOT HOLES ────────────────────
 *
 * `off` and `unknown` answer TRUE.
 *
 *   · **`off`** is the byte-identical path: a station that does not federate identity must see
 *     exactly the console it saw before this change.
 *   · **`unknown`** is the bridge not having answered `bridge.capabilities` yet. A console that
 *     stripped its controls while waiting would be asserting a restriction the system has not
 *     stated — `B-153`'s defect mirrored — and it would flicker every reconnect. Nothing is
 *     lost: the bridge refuses whatever is pressed, in its own sentence.
 *
 * `signed-out` and `expired` answer FALSE, though in practice the sign-in overlay is already
 * covering the screen. They are answered rather than left to the overlay because a surface
 * outside it must not be the thing that decides.
 */
export function useCanOperate(): boolean {
  const auth = useAuthSession();
  const { canOperateSelected } = useSelectedChannel();

  switch (auth.kind) {
    case 'off':
    case 'unknown':
      return true;
    case 'signed-out':
    case 'expired':
      return false;
    case 'signed-in':
      return holdsPermissionClass(auth.principal.roles, 'operator') && canOperateSelected;
  }
}

/**
 * 🔴 **THE PRINCIPAL AXIS ALONE — does this sign-in operate AT ALL?**
 *
 * ⚠ **Deliberately blind to the channel, and that is the design rather than a shortcut.**
 * "This sign-in does not operate" and "this channel is not yours" are two different facts
 * with two different remedies — an account change versus switching to a channel that IS
 * theirs — so they are stated by two different instruments, in the place each belongs. This
 * one is the status bar's, beside the identity; the channel's belongs on the channel strip,
 * where the channel is. Folding them would make one pill report two axes, which is golden
 * rule 8's shape and exactly what `IdentityIndicator` refused to do with the link.
 *
 * ⭐ It is also what keeps the STATUS BAR from depending on the channel list. A pill that
 * needed the selected channel would pull the fixed bank and the channel settings into every
 * surface that renders a footer, for a fact that does not turn on either.
 *
 * Returns `null` when there is nothing to state: auth off, no answer yet, or a principal who
 * does operate.
 */
export function useReadOnlyReason(): string | null {
  const auth = useAuthSession();
  if (auth.kind !== 'signed-in') return null;
  return holdsPermissionClass(auth.principal.roles, 'operator')
    ? null
    : 'READ ONLY — THIS SIGN-IN DOES NOT OPERATE';
}

/**
 * 🔴 `C-038` — **THE ROLE ALONE, WITHOUT THE CHANNEL.** Does this principal operate this
 * station at all?
 *
 * ⚠ **THIS IS WHAT THE UNSCOPED VERBS ASK, AND USING {@link useCanOperate} FOR THEM WOULD BE
 * A DEFECT WITH A NAME.**
 *
 * `stack.silence-all-live-plates` STAYS UNSCOPED — owner answer A16 and CLAUDE.md's cadence
 * floor — because its scope is the whole ledger and an emergency control must not depend on
 * the bookkeeping whose failure is the emergency. The bridge therefore applies no channel
 * check to it. A console that hid PANIC because the SELECTED channel happened not to be
 * granted would be withholding a control the bridge would have accepted — taking the escape
 * hatch away from an operator who has every right to it, for a reason that is not even true.
 * That is `B-122`'s shape exactly: gating the emergency control on state that is allowed to
 * be wrong.
 *
 * The same argument covers RELEASE on a stranded live row. A stranded row is `B-145`'s
 * subject — a producer the bridge seated and the reconciler no longer carries — and its
 * channel may not be the one the console is scoped to. Refusing the remedy there would
 * rebuild `B-212`'s trap: a fault with no reachable way out.
 *
 * ⭐ So the rule is: **a verb the BRIDGE scopes by channel asks {@link useCanOperate}; a verb
 * the bridge leaves unscoped asks THIS.** The two gates mirror the two gates on the other
 * side, which is what keeps a control offered and a command accepted the same judgement.
 */
export function useHoldsOperatorRole(): boolean {
  const auth = useAuthSession();
  switch (auth.kind) {
    case 'off':
    case 'unknown':
      return true;
    case 'signed-out':
    case 'expired':
      return false;
    case 'signed-in':
      return holdsPermissionClass(auth.principal.roles, 'operator');
  }
}

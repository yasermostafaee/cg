import { LogOut } from 'lucide-react';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Icon } from '../../ui/Icon.js';
import { useAuthSession } from '../../hooks/useAuthSession.js';

/**
 * 🔴 `R-066` — **THE WAY OUT. Present only while there is something to leave.**
 *
 * ── WHY IT IS A CONTROL AND THE PILL BESIDE IT IS NOT ───────────────────────
 *
 * `IdentityIndicator` states a FACT — who is signed in — and golden rule 13's door says a fact
 * is written as a fact and never as a control. This is the complement: signing out is an ACT,
 * so it is a button, and it is a separate element rather than the pill made clickable.
 *
 * ⚠ It renders NOTHING in every state but `signed-in`. A signed-out console has nothing to
 * sign out of, and a disabled SIGN OUT sitting on the bar would be a control telling the
 * operator they lack a permission when the truth is there is no session — the strongest form of
 * "it does not apply" is that it does not exist.
 *
 * ⚠ An `AsyncButton` and not a `Button`, because it is a bridge round trip: the bridge is asked
 * to drop the principal (`auth.sign-out`) rather than the socket being thrown away, and the
 * operator should see that the ask is in flight. `design.md` §3 records why a fresh socket was
 * rejected as the mechanism.
 *
 * ⚠ **It always reports `accepted: true`.** `signOut()` clears THIS console whatever the bridge
 * answered — the token is gone from storage either way, and a bridge that did not hear it
 * refuses the next intent anyway once the token stops verifying. A red X here would tell the
 * operator they are still signed in when they are not, which is the one wrong thing this
 * control could say.
 */
export function SignOutButton(): JSX.Element | null {
  const auth = useAuthSession();
  if (auth.kind !== 'signed-in') return null;

  return (
    <AsyncButton
      aria-label="Sign out"
      title="Sign out of this console. Playout continues; nothing goes off air."
      run={() => window.cg.auth.signOut().then(() => ({ accepted: true }))}
    >
      <Icon icon={LogOut} />
      Sign out
    </AsyncButton>
  );
}

import { Button } from '../../ui/Button.js';
import { reloadOnPurpose } from './leavePrompt.js';

/**
 * 🔴 `CENTRAL-BRIDGE-01` (D8) + `B-320` (`SIGNIN-ESCAPE-01`) — **THE WAY BACK TO SET UP, INSIDE CG
 * CONTROL.** A console pointed at the wrong station cannot reach Station setup to fix it: that is behind
 * a station admin's sign-in, over that very CG Bridge. So it forgets this console's station
 * (`setup.forgetStation`) and starts again (`reloadOnPurpose`), on the Set up page's one question. Absent
 * in a browser, which follows the page's host and has nothing to forget.
 *
 * ONE control in both places it appears, so its rule cannot drift between them (golden rule 6):
 *
 *   - the NOT CONNECTED banner — a CG Bridge this console cannot reach;
 *   - the sign-in gate — a CG Bridge it CAN reach whose Playout cannot sign anybody in (`B-320`: the
 *     owner's own PC, a fresh CG Bridge with no Playout behind it, and a gate with no way out). There it
 *     is always offered, whatever the check says: a wrong station that answers cannot be told from the
 *     right one by its lines.
 *
 * It sends nothing to CG Bridge or CasparCG — the record is this console's own — so what is on air stays
 * on air. No confirm and no prose: the banner never had either.
 */
export function SetUpAgain({
  reload = () => reloadOnPurpose(),
}: {
  /** Start the console again (a test passes its own: jsdom's `location.reload` is fixed). */
  reload?: () => void;
}): JSX.Element | null {
  if (!window.cg.setup.canSetPlayoutAddress()) return null;
  return (
    <Button
      variant="ghost"
      onClick={() => {
        // A store that will not forget does not restart into the same failure.
        if (window.cg.setup.forgetStation()) reload();
      }}
    >
      Set up again
    </Button>
  );
}

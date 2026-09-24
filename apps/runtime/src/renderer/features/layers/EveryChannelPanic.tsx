import { useHoldsOperatorRole } from '../../hooks/useCanOperate.js';
import { useLink } from '../../hooks/useLink.js';
import { useLockCoverage } from '../../hooks/useLock.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { BRIDGE_DOWN_REASON } from '../../ui/reachWording.js';
import { useSelectedChannel } from '../channels/useSelectedChannel.js';
import { reportCommandError } from '../status/commandFeedback.js';
import { readPanicReport } from './panicReport.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 C — **THE EVERY-CHANNEL SILENCE, a control of its own.**
 *
 * The owner's decision (2026-09-23, A16's follow-up): PANIC on a channel's view silences THAT
 * channel, and a SEPARATE, EXPLICIT control silences every channel. This is the second one. It
 * calls `silenceAllLivePlates` exactly as the one PANIC always did — no argument, the bridge's
 * whole ledger, `B-122`'s rule that status is not asked first — and it reads its answer through
 * the same `readPanicReport` as the per-channel control, so the two cannot drift into two
 * grammars.
 *
 * ── WHERE IT SITS, WHICH IS HALF OF WHAT IT SAYS ─────────────────────────────────────
 *
 * Beside the channel strip, not in the plates toolbar. The toolbar's PANIC is at the head of the
 * rows it acts on because its scope is the list below it; this one's scope is EVERY channel, so it
 * sits with the channels. Placed there it cannot be mistaken for the per-channel control — the
 * two are never side by side — and it is reachable from every view, whichever tab is open.
 *
 * ── WHEN IT IS THERE ───────────────────────────────────────────────────────────────────
 *
 * Only on a station that declares two or more channels (`multiChannel`, `channelView`'s one
 * reading). With one channel the toolbar's PANIC already IS this verb — the two scopes are one
 * set — and a second button doing the same thing would be a second spelling of the control. And
 * only for a principal who holds the `operator` role: the verb is unscoped (A16), so the ROLE is
 * the question, exactly as for the one PANIC before it. For anyone else it is ABSENT (golden
 * rule 13). A bridge that is down leaves it present and disabled with the reason — reachability is
 * transient, and a control that comes and goes moves under the hand reaching for it.
 *
 * ⚠ NO CONFIRM, for the reason the toolbar's PANIC gives: an emergency control behind a dialog is
 * one that does not happen, and silencing is the RECOVERABLE direction — the faders are still
 * there.
 */
export function EveryChannelPanic(): JSX.Element | null {
  const { multiChannel } = useSelectedChannel();
  const holdsOperator = useHoldsOperatorRole();
  const linkDown = useLink() === 'disconnected';
  /*
    🔴 §2 F — a lock that reaches this console covers at least one of its channels, and the
    every-channel silence reaches that channel's plates as well: the bridge refuses it whenever
    its ledger holds a seat on a covered channel this principal holds (`lockRefuses`). So under
    such a lock it is WITHDRAWN rather than offered and refused; each uncovered channel's own
    PANIC stays in that channel's view. (`all` coverage is the console's lock screen anyway.)
  */
  const locked = useLockCoverage().kind !== 'none';
  if (!multiChannel || !holdsOperator || locked) return null;
  return (
    <AsyncButton
      variant="caution-strong"
      run={async () =>
        readPanicReport(await window.cg.stack.silenceAllLivePlates(), { kind: 'every' })
      }
      onError={reportCommandError}
      disabled={linkDown}
      title={
        linkDown
          ? BRIDGE_DOWN_REASON
          : 'Set EVERY live plate the bridge has seated to zero, on EVERY channel this bridge ' +
            'drives, including rows this console does not show as on air. The pictures stay on ' +
            'air. There is no un-panic — raise what you need again on its own fader.'
      }
      className="cg-plate-panic"
      data-every-channel-panic=""
      aria-label="Silence all boxes on every channel — set every live plate the bridge has seated to zero, whichever channel it is on"
    >
      SILENCE ALL PLATES · EVERY CHANNEL
    </AsyncButton>
  );
}

import type { EmptiedAirNotice as Notice, EmptiedAirRefusal } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { useLink } from '../../hooks/useLink.js';
import { useOperatorNames } from '../../hooks/useOperatorNames.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
import { runCommand } from '../status/commandFeedback.js';

interface Props {
  notice: Notice | null;
}

const styles = {
  strip: {
    border: '1px solid #B45309',
    background: 'rgba(180, 83, 9, 0.12)',
    borderRadius: '0.25rem',
    padding: '0.5rem 0.75rem',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    fontSize: '0.85rem',
    color: '#FCD34D',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  actions: { display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 },
  detail: { color: colors.text, fontSize: '0.78rem' },
  rows: { color: colors.text, fontSize: '0.78rem', margin: 0, paddingInlineStart: '1.1rem' },
  refusal: { color: '#FCD34D' },
  /**
   * `B-232` — the layer coordinate, QUIET but present.
   *
   * Muted and a size down, so the operator's own words carry the line and the number
   * does not compete with them — but rendered, not hidden behind a hover, because
   * `R-028` names the one moment it is needed: clearing that layer BY HAND, which is
   * done when the console is not helping and a pointer may not be.
   *
   * `dir="ltr"` on the element: `1-9` is a coordinate, and in a line whose names are
   * Persian the bidi algorithm would otherwise be free to reorder it.
   */
  layer: { color: colors.textMuted, fontSize: '0.72rem' },
} as const;

/** How each refusal reads to an operator. Every member of the union, named. */
const REFUSAL_TEXT: Record<EmptiedAirRefusal, string> = {
  'unknown-template': 'its template is no longer loaded',
  disconnected: 'nothing could be sent',
  rehearsing: 'it is on PVW — leave rehearse first',
  'unknown-item': 'it is no longer on the stack',
  refused: 'the take was refused',
};

/*
  🔴 `B-232` — THIS LINE USED TO READ `1-9 · e506e319-6e68-4603-a5f4-290b21616250`.

  A channel-layer and a raw template UUID, in the one sentence an operator reads when air
  has just gone empty under him. He knows those rows as «لوگوی اصلی» and «زیرنویس اصلی» —
  the NAME column two panels below — and has never typed a UUID in his life.

  The naming now comes from `ui/operatorNaming.ts`, which states the rule for every
  surface rather than for this one. See its header for the four places this same defect
  has been reported from.
*/

/**
 * 🔴 **`B-225` — THE PLAYOUT SERVER STOPPED CARRYING WHAT THIS CONSOLE PUT ON AIR.**
 *
 * With NSSM auto-restarting the service, a CasparCG restart returns a channel that emits a
 * valid, correctly-timed BLACK picture: nothing downstream faults, every pill stays green, and
 * the only symptom is rows quietly going grey. This is the sentence that says otherwise.
 *
 * ── WHY IT LIVES HERE AND NOT WITH THE FIVE TOP-OF-PAGE BANNERS ─────────────
 *
 * `ConnectionBanner`, `BridgeSkewBanner`, `FailoverBanner`, `RasterMismatchBanner` and
 * `OutputMissingBanner` all describe **the link or the plant's configuration** — standing
 * conditions, none of which the operator can resolve from the banner itself. A sixth one up
 * there would compete with them for the alarm budget while being a different KIND of thing.
 *
 * This strip renders in the chrome directly above the LAYER LIST, beside
 * `OrphanLayersBanner` — the one region that already talks about layers and what is on them,
 * and the only one carrying per-row operator ACTIONS. It names ROWS in that list and offers to
 * act on them, so it belongs with the list, in the same visual language (the amber attention
 * treatment, never the on-air red: air is empty, which is a condition to fix, not an error the
 * operator caused).
 *
 * ⚠ It is a SEPARATE component rather than a fourth strip inside `OrphanLayersBanner`: that
 * component is fed by the occupancy sweep and is about layers carrying something unexpected.
 * This is about rows carrying nothing. Same place, same treatment, different question.
 *
 * ── DISMISSAL, AND THE THREE WAYS IT ENDS ───────────────────────────────────
 *
 * Never auto-dismissed and never timed out — it persists until one of:
 *
 *   1. the operator presses **PUT BACK ON AIR** and every row lands (rows that land leave the
 *      notice individually, so a partial press leaves the rest listed with their reasons);
 *   2. the operator presses **DISMISS**, which is bridge-side, so two browsers cannot disagree
 *      about whether the console is still reporting empty air. It changes nothing on the wire;
 *   3. the rows leave it by themselves — an ordinary take or a remove retires a row, so a
 *      notice cannot outlive the situation it describes.
 *
 * ⚠ **Not translated.** Multi-language is deferred for both apps, so this is English beside
 * the rest of the console's chrome rather than a lone half-localised surface.
 */
export function EmptiedAirNotice({ notice }: Props): JSX.Element | null {
  // Above the idle-quiet early return: hooks cannot be called conditionally.
  const { confirm, confirmDialog } = useConfirm();
  /*
    THE RESTORE EMITS AMCP — a `CG ADD` and a `PLAY` per row — so it is gated on BOTH hops
    exactly like the orphan Clear beside it. An enabled-but-dead button is costliest on a
    surface the operator reaches only when the console has already failed them: they press it,
    believe air is coming back, and watch black stay on.
  */
  const linkDown = useLink() === 'disconnected';
  const casparReach = useCasparReach();
  const refusal = casparRefusalReason(linkDown, casparReach);
  // `B-232` — above the early return with the rest of the hooks; an empty list when there
  // is no notice, which is what the strip is doing every second it is not needed.
  const nameOf = useOperatorNames(notice?.rows ?? []);

  if (notice === null) return null;

  const count = notice.rows.length;
  const rowWord = count === 1 ? 'row' : 'rows';
  /*
    🔴 THE CLAIM IS EXACTLY WHAT WAS MEASURED, AND NO MORE.

    The bridge cannot prove the server restarted — CasparCG publishes no boot marker, uptime
    or channel generation on any wire this system reads, and adding a probe to find out was
    ruled out. What it CAN say is that the layers it had put producers on came back with no
    producer. `newConnection` narrows it honestly: a restart necessarily kills the AMCP
    socket, so a NEW connection makes a restart the likely cause, while the same connection
    coming back with empty layers points at something else clearing the channel.
  */
  const cause = notice.newConnection
    ? 'The connection dropped and came back with the layers empty — most likely the playout server restarted.'
    : 'The connection never dropped, so something else cleared these layers.';
  const seats =
    notice.seatsDropped > 0
      ? ` ${String(notice.seatsDropped)} live source ${notice.seatsDropped === 1 ? 'seat' : 'seats'} went with them.`
      : '';

  return (
    <>
      <div style={styles.strip} role="alert" aria-label="Air emptied by the playout server">
        <div style={styles.row}>
          <span>
            ⚠ The channel is alive and carrying nothing — {count} {rowWord} that{' '}
            {count === 1 ? 'was' : 'were'} on air {count === 1 ? 'is' : 'are'} gone.{' '}
            <span style={styles.detail}>
              {cause}
              {seats} Nothing has been put back.
            </span>
          </span>
          <span style={styles.actions}>
            <Button
              variant="caution-strong"
              aria-label={`Put ${String(count)} ${rowWord} back on air`}
              disabled={refusal !== undefined}
              title={
                refusal ?? `Re-take ${String(count)} ${rowWord} — this puts graphics back ON AIR`
              }
              onClick={() => {
                /*
                  🔴 CONFIRM-GATED, because this PUTS GRAPHICS ON AIR. The owner chose
                  detect-and-say over restoring automatically precisely so that a person
                  decides; a one-click path from a banner to live output would give back most
                  of what that decision was protecting.
                */
                void (async () => {
                  const ok = await confirm({
                    title: `Put ${String(count)} ${rowWord} back on air?`,
                    body: `This re-takes ${count === 1 ? 'it' : 'them'} and puts ${count === 1 ? 'it' : 'them'} on air now.`,
                    confirmLabel: 'Put back on air',
                    tone: 'play',
                  });
                  if (!ok) return;
                  runCommand(
                    `Put ${String(count)} ${rowWord} back on air`,
                    window.cg.emptiedAir
                      .restore({ itemIds: notice.rows.map((r) => r.itemId) })
                      // Anything short of ALL of them is reported, and the strip stays up
                      // carrying each remaining row's reason.
                      .then((r) => ({ accepted: r.restored === count })),
                  );
                })();
              }}
            >
              PUT BACK ON AIR
            </Button>
            <Button
              variant="ghost"
              aria-label="Dismiss the emptied-air notice"
              title="Hide this notice. Nothing is sent and nothing changes on air."
              onClick={() => {
                void window.cg.emptiedAir.dismiss();
              }}
            >
              DISMISS
            </Button>
          </span>
        </div>
        <ul style={styles.rows}>
          {notice.rows.map((row) => {
            const name = nameOf(row);
            return (
              /*
                The ids go on the `title` and nowhere else. Nothing forensic is lost —
                `B-211`'s rule that an id is the only unrepeatable handle still holds; it
                is about which of the two is in the SENTENCE.
              */
              <li key={row.itemId} title={name.title} data-emptied-row="">
                <OperatorNames name={name} />
                {name.layer !== null && (
                  <>
                    {' '}
                    <span style={styles.layer} dir="ltr" data-emptied-layer="">
                      {name.layer}
                    </span>
                  </>
                )}
                {row.refusal !== undefined && (
                  <span style={styles.refusal}> — not put back: {REFUSAL_TEXT[row.refusal]}</span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
      {confirmDialog}
    </>
  );
}

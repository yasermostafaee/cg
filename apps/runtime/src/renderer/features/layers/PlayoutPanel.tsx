import type { PlayoutLayerState } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useLink } from '../../hooks/useLink.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import {
  playoutClearRefusal,
  playoutOccupancy,
  clearablePlayoutLayers,
} from './playoutOccupancy.js';

interface Props {
  layers: readonly PlayoutLayerState[];
}

const styles = {
  intro: {
    padding: '0.6rem 1rem',
    fontSize: '0.8rem',
    color: colors.textMuted,
    borderBottom: `1px solid ${colors.border}`,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: '1rem',
  },
  list: { overflowY: 'auto' as const, minHeight: 0 },
  row: {
    display: 'grid',
    gridTemplateColumns: 'auto 1fr auto',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 1rem',
    borderBottom: `1px solid ${colors.border}`,
  },
  layerNumber: {
    fontSize: '1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums' as const,
    minWidth: '3.25rem',
    textAlign: 'center' as const,
  },
  body: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  occupant: { fontSize: '0.9rem', fontWeight: 700 },
  reason: { fontSize: '0.78rem', color: colors.textMuted },
  empty: { padding: '1rem', fontSize: '0.85rem', color: colors.textMuted },
} as const;

/**
 * R-028 part B — the PLAYOUT tab: the declared reserved layers (C-015), what is
 * on them, and a deliberate clear.
 *
 * This surface REVERSES task 5.3's "playout rows offer no operator verbs", on
 * the owner's explicit decision, and the reasoning is the specification: the
 * original prohibition existed to stop the operator killing the antenna feed or
 * a live channel. Now that the graphics layers are DECLARED in advance, a
 * graphic the playout system put on 60–69 is something the operator can see and
 * should be able to clear.
 *
 * Three constraints keep that safe, and none is decoration:
 *
 *  1. AUTOMATIC NEVER, DELIBERATE YES. The R-009 orphan sweep still excludes
 *     these layers and `layers.clear` still refuses them (part A, unchanged).
 *     Nothing surfaces them unasked; this tab is opened on purpose and says
 *     whose layers these are.
 *  2. HTML ONLY. The reservation is a claim about who owns the LAYER, never
 *     about what is on it. A video / route / decklink can land there — including
 *     by the playout operator's own mistake — and clearing THAT is exactly the
 *     accident the reservation exists to prevent. Non-html occupants get NO
 *     clear control at all, and the bridge refuses them independently.
 *  3. UNKNOWN IS NOT EMPTY. A layer whose occupancy cannot be verified reads as
 *     unknown in its own right — never as "nothing here" — and offers no clear.
 *
 * What the html gate does NOT promise, stated so the wording never oversells
 * it: "html" means "not a video feed". It does not mean "unimportant" — an html
 * producer here may be the station's own on-air graphics package, and clearing
 * it takes real graphics off air. That is the accepted, intended power of this
 * tab; the operator is told whose layer it is and confirms.
 */
export function PlayoutPanel({ layers }: Props): JSX.Element {
  const linkDown = useLink() === 'disconnected';
  const casparReach = useCasparReach();
  const { confirm, confirmDialog } = useConfirm();

  const clearable = clearablePlayoutLayers(layers, linkDown);

  /**
   * ── REACHABILITY IS NOT WHAT THE "DELIBERATELY NOT A DISABLED BUTTON" COMMENT
   *    BELOW IS ABOUT, AND THE TWO MUST NOT BE CONFLATED ──────────────────────
   *
   * That comment governs the LAYER-STATE gate: a non-html occupant, an
   * unverifiable occupancy, an empty layer. There, no control at all is right —
   * the reason is a permanent property of what is on the layer, it is printed in
   * the row beside it, and a disabled button would invite the operator to keep
   * trying at something that will never become available.
   *
   * REACHABILITY is the opposite kind of fact: transient, nothing to do with this
   * layer, and it returns the instant the link does. So the control stays PRESENT
   * and goes DISABLED with the reason — the same treatment every other
   * AMCP-emitting verb gets, and the same reason it exists: with either hop down
   * the command never leaves, so an enabled button is not a capability, it is the
   * appearance of one, and it costs the operator the seconds in which he believes
   * another system's graphic is coming off air.
   *
   * The layer-state gate is untouched: a control that `playoutOccupancy` refuses
   * to offer is still ABSENT, not disabled, whatever this says.
   */
  const clearRefusal = casparRefusalReason(linkDown, casparReach);

  /**
   * Clear ONE playout layer.
   *
   * The refusal is reported HERE, with the rule that fired, and the result is
   * returned as `cancelled` rather than `accepted: false`. That is not a
   * cosmetic choice: `AsyncButton` routes a plain `accepted: false` to its
   * `onError`, which would fire a second, GENERIC "Not accepted." toast and —
   * the toast being last-write-wins — overwrite the specific message a
   * fraction of a second after the operator saw it. The operator would be told
   * a clear failed but not that it failed because the layer now carries a
   * VIDEO. `cancelled` is the one result `asyncResultMessage` deliberately
   * stays silent about, so the specific message survives.
   */
  const clearOne = async (
    layer: PlayoutLayerState,
  ): Promise<{ accepted: boolean; cancelled?: boolean }> => {
    const res = await window.cg.playoutLayers.clear({
      channel: layer.channel,
      layer: layer.layer,
    });
    if (res.ok) return { accepted: true };
    reportCommandError(playoutClearRefusal(res.reason, res.observedProducer));
    return { accepted: false, cancelled: true };
  };

  /**
   * The per-layer CLEAR's confirm gate.
   *
   * This module's own doc — and the channel's — promise that "the operator is
   * told whose layer it is and confirms". The first draft dispatched straight
   * from the button, which broke that promise on the single most dangerous
   * control in the product: one click taking ANOTHER system's live graphic off
   * air. Part A's `useConfirm` pattern, reused rather than reinvented.
   */
  const confirmAndClearOne = async (
    layer: PlayoutLayerState,
  ): Promise<{ accepted: boolean; cancelled?: boolean }> => {
    const ok = await confirm({
      title: `Clear playout layer ${String(layer.layer)}?`,
      body:
        `This is NOT our layer — it belongs to the playout system. Its graphic leaves air ` +
        `immediately, with no outro. Only the playout side can put it back.`,
      confirmLabel: `Clear layer ${String(layer.layer)}`,
    });
    if (!ok) return { accepted: false, cancelled: true };
    return clearOne(layer);
  };

  const clearAll = async (): Promise<{ accepted: boolean; cancelled?: boolean }> => {
    if (clearable.length === 0) return { accepted: false, cancelled: true };
    const list = clearable.map((l) => String(l.layer)).join(', ');
    const ok = await confirm({
      title: `Clear ${String(clearable.length)} playout layer${clearable.length === 1 ? '' : 's'}?`,
      body:
        `These are NOT our layers — they belong to the playout system. ` +
        `Layer${clearable.length === 1 ? '' : 's'} ${list} will be cleared immediately and ` +
        `whatever graphics are on them leave air with no outro. ` +
        `Occupants that are not html templates, and any layer whose occupancy cannot be ` +
        `verified, are NOT included and stay untouched.`,
      confirmLabel: `Clear ${String(clearable.length)} layer${clearable.length === 1 ? '' : 's'}`,
    });
    if (!ok) return { accepted: false, cancelled: true };
    // N calls to the SAME single-layer channel (the UN-gated `clearOne` — this
    // bulk path carries its own confirm above, and N dialogs for one decision
    // would be worse than none). The BRIDGE's gate still applies per layer
    // exactly as for one click, so a bulk action can never clear something the
    // single action would refuse.
    const results = await Promise.all(clearable.map((l) => clearOne(l)));
    const cleared = results.filter((r) => r.accepted).length;
    const refused = results.length - cleared;
    // Report what actually happened, INCLUDING the failures. A green
    // "cleared N" naming only the successes would overwrite the per-layer
    // refusals emitted moments earlier (the toast is last-write-wins), leaving
    // the operator believing a partial clear was a complete one — while a
    // graphic they meant to remove is still on air.
    if (refused > 0) {
      reportCommandError(
        `Cleared ${String(cleared)} of ${String(results.length)} playout layer(s) — ` +
          `${String(refused)} refused and ${refused === 1 ? 'is' : 'are'} still on air. ` +
          `Check the rows for the reason.`,
      );
    } else if (cleared > 0) {
      reportCommandSuccess(`Cleared ${String(cleared)} playout layer${cleared === 1 ? '' : 's'}.`);
    }
    // `cancelled` so AsyncButton stays silent: this function has already said
    // precisely what happened, and a generic follow-up would overwrite it.
    return { accepted: cleared > 0, cancelled: true };
  };

  if (layers.length === 0) {
    return (
      <div style={styles.empty}>
        No playout layers are declared. Reserve them in the bridge&rsquo;s configuration (
        <code>--reserved-layers</code>) to see what the playout system has on air.
      </div>
    );
  }

  return (
    <>
      <div style={styles.intro}>
        <span>
          These layers belong to the PLAYOUT system, not to this console. Clearing one takes its
          graphic off air.
        </span>
        {clearable.length > 0 && (
          <AsyncButton
            variant="caution-strong"
            run={clearAll}
            onError={reportCommandError}
            disabled={clearRefusal !== undefined}
            {...(clearRefusal !== undefined ? { title: clearRefusal } : {})}
            aria-label={`Clear all ${String(clearable.length)} clearable playout layers`}
          >
            CLEAR ALL
          </AsyncButton>
        )}
      </div>
      <div style={styles.list}>
        {layers.map((layer) => {
          const state = playoutOccupancy(layer, linkDown);
          return (
            <div key={layer.layer} style={styles.row} data-playout-layer={String(layer.layer)}>
              <span style={styles.layerNumber}>{String(layer.layer)}</span>
              <div style={styles.body}>
                <span style={{ ...styles.occupant, color: state.tone }}>{state.occupant}</span>
                <span style={styles.reason}>{state.detail}</span>
              </div>
              {state.clearable ? (
                <AsyncButton
                  variant="caution-strong"
                  run={() => confirmAndClearOne(layer)}
                  onError={reportCommandError}
                  disabled={clearRefusal !== undefined}
                  {...(clearRefusal !== undefined ? { title: clearRefusal } : {})}
                  aria-label={`Clear playout layer ${String(layer.layer)}`}
                >
                  CLEAR
                </AsyncButton>
              ) : (
                // Deliberately NOT a disabled button: an operator must not be
                // left wondering whether the control would work if they tried
                // harder. No control at all, and the reason is in the row.
                <span aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
      {confirmDialog}
    </>
  );
}

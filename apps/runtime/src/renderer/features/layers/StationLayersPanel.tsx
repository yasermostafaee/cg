import type { OrphanLayer, PlayoutLayerState } from '@cg/shared-ipc';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useLink } from '../../hooks/useLink.js';
import { useLiveLayers } from '../../hooks/useLiveLayers.js';
import { useStationLayers } from '../../hooks/useStationLayers.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import {
  playoutClearRefusal,
  stationLayerOccupancy,
  clearableStationLayers,
} from './stationLayerOccupancy.js';

interface Props {
  layers: readonly PlayoutLayerState[];
  /**
   * 🔴 `B-235` — layers carrying a producer THIS console did not put there, which were
   * never declared reserved either. Disjoint from `layers` by construction (the bridge
   * excludes the reserved range from the orphan set on purpose), and together the two
   * are the whole of "not yours". See the group's own note below.
   */
  orphans: readonly OrphanLayer[];
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
  /** `B-235` / `STATION-CHROME-01` §3 — the two groups this panel now carries below the rows. */
  group: {
    padding: '0.6rem 1rem',
    borderTop: `1px solid ${colors.border}`,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
  },
  groupTitle: {
    fontSize: '0.72rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
  groupValue: {
    fontSize: '0.85rem',
    color: colors.text,
    fontVariantNumeric: 'tabular-nums' as const,
  },
  groupNote: { fontSize: '0.72rem', color: colors.textMuted, margin: 0, lineHeight: 1.5 },
  code: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' },
} as const;

/** `60–69, 105` for a sorted layer list — the spelling the CLI flag itself takes. */
export function describeLayerRanges(layers: readonly number[]): string {
  const sorted = [...new Set(layers)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let prev: number | null = null;
  for (const layer of sorted) {
    if (start === null || prev === null) {
      start = layer;
      prev = layer;
      continue;
    }
    if (layer === prev + 1) {
      prev = layer;
      continue;
    }
    parts.push(start === prev ? String(start) : `${String(start)}–${String(prev)}`);
    start = layer;
    prev = layer;
  }
  if (start !== null && prev !== null) {
    parts.push(start === prev ? String(start) : `${String(start)}–${String(prev)}`);
  }
  return parts.join(', ');
}

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
export function StationLayersPanel({ layers, orphans }: Props): JSX.Element {
  const linkDown = useLink() === 'disconnected';
  const casparReach = useCasparReach();
  const { confirm, confirmDialog } = useConfirm();

  const clearable = clearableStationLayers(layers, linkDown);

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
   * The layer-state gate is untouched: a control that `stationLayerOccupancy` refuses
   * to offer is still ABSENT, not disabled, whatever this says.
   *
   * ── A THIRD CASE: THE ROW'S CONTEXT MENU, WHICH TAKES THE OPPOSITE RULE TO THE
   *    VERB BLOCK, AND THE REASON IS SPATIAL ─────────────────────────────────────
   *
   * `operator-surface` `§4.2` — the two cases above are both about a control's own
   * state. This one is about WHERE a control lives, and it is recorded here because
   * this comment is the boundary a later reader consults, not because it is a fourth
   * spelling of it.
   *
   * In the fixed verb BLOCK, availability varies by STATE and presence NEVER does: a
   * control that appears and disappears moves the target under a reaching hand, and
   * shifts every header word to its right onto the wrong glyph (`layerTable.ts`'s
   * `VERB_COUNT` note owns that half). In the MENU there is no target to move — a list
   * opened on demand may vary in length — so a control MAY be offered only on the rows
   * it applies to, and a permanently-dead entry in thirty row menus is furniture that
   * teaches the operator to stop reading the menu (`live-source-multibox` 6.9e, where
   * the decision was made and argued when the control shipped).
   *
   * ⚠ **So "present but disabled" is the block's rule and NOT the menu's, and
   * harmonising the two would be a regression in whichever direction it went.** The
   * shipped instances are R-048's SOURCE swap and C-015 6.5f's plate AUDIO, both
   * conditionally spread on `hasLivePlates`, both asserted over the full state matrix
   * in `layerRow.dom.test.ts`. One residual cost, recorded rather than resolved: the
   * menu's LENGTH varies by row, so `menuLast` keeps REMOVE last in both shapes.
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
      <>
        <div style={styles.empty}>
          No playout layers are declared. Reserve them in the bridge&rsquo;s configuration (
          <code>--reserved-layers</code>) to see what the playout system has on air.
        </div>
        <UndeclaredLayers orphans={orphans} />
        <StationLayerDeclarations />
      </>
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
          const state = stationLayerOccupancy(layer, linkDown);
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
      <UndeclaredLayers orphans={orphans} />
      <StationLayerDeclarations />
      {confirmDialog}
    </>
  );
}

/**
 * 🔴 `B-235` — **the other half of "not yours": a layer in use that nobody declared.**
 *
 * The rows above are the DECLARED reserved set, and that is the whole of what
 * `playoutLayersState()` can ever return — it maps over `#reservedLayers` and nothing else.
 * A layer another system is using that was never declared is therefore ABSENT from what this
 * panel reads, which is why the panel used to be silent about exactly the case it exists for.
 * That layer surfaces instead in the R-009 orphan strip above the layer list, and the two
 * sets are disjoint by construction (the bridge excludes the reserved range from the orphan
 * set on purpose, so a playout graphic is never offered a Clear it should not have).
 *
 * ⚠ **NO CLEAR HERE, DELIBERATELY.** The orphan strip owns that action, with its confirm
 * gate, its reachability gate and its `B-233` naming. A second Clear on a second surface is
 * two implementations of the single most dangerous control in the product — which is what
 * golden rule 6 is about. This group NAMES the layer and points at the one control.
 */
function UndeclaredLayers({ orphans }: { orphans: readonly OrphanLayer[] }): JSX.Element | null {
  if (orphans.length === 0) return null;
  return (
    <div style={styles.group} data-undeclared-layers="">
      <span style={styles.groupTitle}>In use, never declared</span>
      {[...orphans]
        .sort((a, b) => a.channel - b.channel || a.layer - b.layer)
        .map((o) => (
          <span
            key={`${String(o.channel)}-${String(o.layer)}`}
            style={styles.groupValue}
            dir="ltr"
            data-undeclared-layer={String(o.layer)}
          >
            Channel {String(o.channel)}, layer {String(o.layer)} — {o.producer}
          </span>
        ))}
      <p style={styles.groupNote}>
        Something is on these layers that this console did not put there, and they are{' '}
        <b>never declared</b> reserved — so they are not in the list above and never will be.
        Declare them with <span style={styles.code}>--reserved-layers</span> to see them as rows
        here. To take one off air now, use the warning strip above the layer list: it owns that
        Clear, with its confirm gate.
      </p>
    </div>
  );
}

/**
 * `STATION-CHROME-01` §3 — **what MOVED here when Station layers left settings.**
 *
 * The reserved DECLARATION (ranges + where they come from) and the LIVE-LAYER LEDGER were in
 * the Station setup section that this change deletes. The declaration is a duplicate of what
 * the rows above already show, so it came across as one line; the LEDGER was reachable ONLY
 * from the settings copy and would otherwise have disappeared with it — which is the check
 * §3 asked for, and it found something.
 *
 * Both are read at bridge start and neither can change from a browser, so this is read-only
 * by construction: it shows what is declared and says where to change it. The console cannot
 * see the bridge's command line, so it cannot say whether the ledger is being PERSISTED or
 * was started with `--no-live-layers`. It says that, rather than guessing.
 */
function StationLayerDeclarations(): JSX.Element {
  const station = useStationLayers();
  const live = useLiveLayers();

  const byChannel = new Map<number, number[]>();
  for (const layer of station) {
    byChannel.set(layer.channel, [...(byChannel.get(layer.channel) ?? []), layer.layer]);
  }
  const reserved = [...byChannel.entries()].sort(([a], [b]) => a - b);

  return (
    <>
      <div style={styles.group} data-reserved-layers="">
        <span style={styles.groupTitle}>Reserved for the station’s playout system</span>
        {reserved.length === 0 ? (
          <span style={styles.groupValue}>None declared.</span>
        ) : (
          reserved.map(([channel, ls]) => (
            <span key={channel} style={styles.groupValue} dir="ltr">
              Channel {String(channel)}: {describeLayerRanges(ls)}
            </span>
          ))
        )}
        <p style={styles.groupNote}>
          Declared at bridge start by <span style={styles.code}>--reserved-layers</span> or{' '}
          <span style={styles.code}>bridge-reserved-layers.json</span> in{' '}
          <span style={styles.code}>~/.cg-runtime</span>. Not editable here — change the flag or the
          file and restart the bridge.
        </p>
      </div>
      <div style={styles.group} data-live-layer-ledger="">
        <span style={styles.groupTitle}>Live-layer ledger</span>
        <span style={styles.groupValue} dir="ltr">
          {!live.ready
            ? 'Not read from the bridge yet.'
            : live.value.length === 0
              ? 'Nothing seated.'
              : `${String(live.value.length)} layer${live.value.length === 1 ? '' : 's'} seated: ${live.value
                  .map((l) => `${String(l.channel)}-${String(l.layer)}`)
                  .join(', ')}`}
        </span>
        <p style={styles.groupNote}>
          The layers this bridge seated behind a template’s live plates. Persisted at{' '}
          <span style={styles.code}>bridge-live-layers.json</span> in{' '}
          <span style={styles.code}>~/.cg-runtime</span> (or where{' '}
          <span style={styles.code}>--live-layers-path</span> points) unless the bridge was started
          with <span style={styles.code}>--no-live-layers</span> — the console cannot see which.
          Which row owns each layer is on the LIVE SOURCES tab.
        </p>
      </div>
    </>
  );
}

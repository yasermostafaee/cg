import { useRef } from 'react';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useLink } from '../../hooks/useLink.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import {
  liveLayerEmptyView,
  releaseScopeOf,
  type LiveLayerBlindness,
  type LiveLayerRowView,
} from './liveLayerRows.js';

interface Props {
  /**
   * The rows, ALREADY resolved — this panel does no deriving of its own.
   *
   * The caller computes them once with `liveLayerRows` and reads the tab’s warning
   * dot off the SAME array, so the dot and the list are one evaluation rather than two
   * that could disagree about whether anything is stranded.
   */
  rows: readonly LiveLayerRowView[];
  /**
   * Whether the LEDGER snapshot itself has arrived — distinct from the rows, and
   * required, because an empty ledger produces no rows to carry a blindness state and
   * the zero-row branch would otherwise assert that nothing is on air (B-094).
   */
  ledgerReady: boolean;
  /** Why the owner verdict cannot be trusted, if it cannot. Shapes the empty state. */
  blind: LiveLayerBlindness | null;
  /** Select the owning row, so its verbs are one click away. */
  onSelectOwner: (itemId: string) => void;
}

const styles = {
  intro: {
    padding: '0.6rem 1rem',
    fontSize: '0.8rem',
    color: colors.textMuted,
    borderBottom: `1px solid ${colors.border}`,
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
  coordinate: {
    fontSize: '1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums' as const,
    minWidth: '3.25rem',
    textAlign: 'center' as const,
  },
  body: { display: 'flex', flexDirection: 'column' as const, gap: '0.15rem', minWidth: 0 },
  headline: { fontSize: '0.9rem', fontWeight: 700 },
  plate: { fontSize: '0.78rem', color: colors.textMuted },
  detail: { fontSize: '0.78rem', color: colors.textMuted },
  empty: {
    padding: '1rem',
    fontSize: '0.85rem',
    color: colors.textMuted,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.35rem',
    lineHeight: 1.5,
  },
  emptyHeadline: { fontWeight: 700, color: colors.text },
} as const;

/**
 * `B-145` acceptance 1, display half (`tasks.md` 2.8) — **the LIVE SOURCES tab: the
 * layers this bridge itself seated behind a template's holes.**
 *
 * ── WHY THIS TAB EXISTS ─────────────────────────────────────────────────────
 *
 * Before it, a seated live layer was CONTROLLABLE but INVISIBLE. The ledger
 * survived a bridge restart, every teardown and repoint door read it by `itemId`,
 * and `CasparRuntime.liveLayers()` had **no production caller at all** — so a guest's
 * face could be composited on air with nothing on any screen saying so. That is the
 * written-but-unreachable class this repo has filed four times, and it is why
 * `B-145` sat at `[~]` with half of its first acceptance unmet.
 *
 * ── WHY A THIRD TAB AND NOT MORE ROWS IN EITHER OF THE OTHER TWO ────────────
 *
 * The bridge already enumerates THREE declared layer classes in one place
 * (`#declaredLayerClass`), and each makes a different claim: `playout` says the layer
 * is not ours to touch, `operator-row` says the operator may USE it, and
 * `live-source` says *we put that producer there ourselves*. The console had a
 * surface for the first two and none for the third. Folding these into STATION
 * LAYERS would have been the worst available option — that tab's whole premise is
 * "these are NOT our layers", and its clear is gated on a producer kind of exactly
 * `html` while a live plate is a `route`, so every row would have arrived carrying
 * the wrong statement and the wrong control.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────────
 *
 * It offers no per-layer clear for a layer whose row exists. The verbs for a seated
 * plate are the ROW's — repoint, audio, off-air — and `layers.clear` refuses a
 * live-source coordinate by name after explicitly rejecting an exemption. So a row
 * with an owner gets the owner's NAME and a way to jump to it, not a duplicate set
 * of controls that would be a second spelling of the row's own.
 *
 * The one exception is a STRANDED layer, and it is the reason the item was filed:
 * see `liveLayerRows.ts`, which holds that rule and its evidence.
 */
export function LiveSourcesPanel({ rows, ledgerReady, blind, onSelectOwner }: Props): JSX.Element {
  const linkDown = useLink() === 'disconnected';
  const casparReach = useCasparReach();
  const { confirm, confirmDialog } = useConfirm();

  /**
   * The same REACHABILITY split the station tab documents at length: the layer-state
   * gate (a row whose owner exists offers nothing) means NO CONTROL AT ALL, because
   * the reason is permanent and printed beside it. Reachability is transient and
   * belongs to no layer, so a control it blocks stays PRESENT and goes DISABLED with
   * the reason — an enabled button whose command cannot leave the browser is not a
   * capability, it is the appearance of one.
   */
  const releaseRefusal = casparRefusalReason(linkDown, casparReach);

  /**
   * 🔴 **THE ROWS AS OF NOW, not as of the render that drew the button.**
   *
   * The confirm below is an UNBOUNDED await: the operator may read it, look at a
   * monitor, and press Release seconds later. In that gap the stack can arrive, a
   * reconnect can complete, or the row can stop being stranded — and the closure that
   * fired still holds the STALE verdict that armed the button. Sending a teardown on
   * a verdict that is no longer true is the shape golden rule 7 exists for: the
   * condition that gates a destructive step must be the one in force when the step
   * happens, not one captured earlier.
   *
   * A ref rather than the prop, deliberately: React hands a re-render NEW props, but
   * an in-flight async closure keeps the old ones. The ref is the only thing in scope
   * that both survives the await and tracks the latest render.
   */
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  /**
   * Release a stranded item's layers.
   *
   * 🔴 **`stack.remove`, NOT a new per-layer clear.** `remove(itemId)` calls
   * `teardownLiveLayers(itemId)` unconditionally on `slot`, and its own comment says
   * why: *"the ledger is keyed by itemId, so an item whose slot was already released
   * can still own live layers, and those are precisely the ones nothing else would
   * ever reach."* The door already existed and already worked; what was missing was a
   * surface that knew the `itemId` to hand it. Inventing a coordinate-addressed clear
   * instead would have been a fourth way to cut a guest off air, and a second spelling
   * of a teardown the bridge already owns.
   *
   * 🔴 **AND IT IS ITEM-SCOPED, WHICH THE WORDING MUST SAY.** `teardownLiveLayers`
   * loops over EVERY record the item owns, so releasing `1-10` also clears `1-11` when
   * both belong to it. The confirm, the accessible name and the toast all name the set
   * `releaseScopeOf` returns, so none of the three can describe a different scope from
   * the one the wire will actually clear.
   *
   * The refusal is reported HERE and returned as `cancelled`, for the station tab's
   * reason: a plain `accepted: false` routes to `AsyncButton`'s `onError`, whose
   * generic toast would overwrite this specific one a fraction of a second later.
   */
  const releaseStranded = async (
    row: LiveLayerRowView,
  ): Promise<{ accepted: boolean; cancelled?: boolean }> => {
    const scope = releaseScopeOf(rowsRef.current, row.itemId);
    const names = scope.map((r) => r.coordinate).join(', ');
    const many = scope.length > 1;
    const ok = await confirm({
      title: many
        ? `Release ${String(scope.length)} stranded layers (${names})?`
        : `Release stranded layer ${row.coordinate}?`,
      body:
        (many
          ? `These ${String(scope.length)} layers — ${names} — were all seated for the same item, ` +
            `and clearing is item-scoped: releasing one releases them all. They carry ` +
            `${scope.map((r) => `"${r.plate}" (${r.producer})`).join(', ')}. `
          : `This layer carries "${row.plate}" (${row.producer}). `) +
        `No row on the stack owns ${many ? 'them' : 'it'}, so nothing else in the console can ` +
        `reach ${many ? 'them' : 'it'}. Releasing clears the ` +
        `layer${many ? 's' : ''} — whatever ${many ? 'they are' : 'it is'} showing leaves air ` +
        `immediately, with no outro — and forgets the bridge's record. If a guest is on ` +
        `${many ? 'one of these layers' : 'this layer'}, they go to black.`,
      confirmLabel: many ? `Release ${String(scope.length)} layers` : `Release ${row.coordinate}`,
    });
    if (!ok) return { accepted: false, cancelled: true };

    /*
      RE-READ AFTER THE AWAIT. If the stack arrived while the dialog was open, this
      item is no longer stranded — its row is back, its own verbs reach these layers,
      and a teardown here would take a guest off air on a verdict that expired while
      the operator was reading. Refuse and say why.
    */
    const stillStranded = releaseScopeOf(rowsRef.current, row.itemId).some((r) => r.releasable);
    if (!stillStranded) {
      reportCommandError(
        `Nothing was sent — ${row.itemId} is no longer stranded. Its row is back on the stack, ` +
          `so use that row's own verbs.`,
      );
      return { accepted: false, cancelled: true };
    }

    const res = await window.cg.stack.remove({ itemId: row.itemId });
    if (!res.accepted) {
      reportCommandError(
        `The release of ${names} was not accepted — ${many ? 'they' : 'it'} may still be on air.`,
      );
      return { accepted: false, cancelled: true };
    }
    reportCommandSuccess(`Released ${names}.`);
    return { accepted: true, cancelled: true };
  };

  if (rows.length === 0) {
    /*
      🔴 The one branch that speaks for the WHOLE list, and so the one that must not
      guess. An empty ledger carries no row to hold a blindness state, so this branch
      takes the facts directly: with the link down, or before the ledger has arrived,
      "nothing is seated" is not something the console knows (B-094).
    */
    const empty = liveLayerEmptyView(blind, ledgerReady);
    return (
      <div style={styles.empty} data-live-layers-known={empty.known ? 'true' : 'false'}>
        <div style={styles.emptyHeadline}>{empty.headline}</div>
        <div>{empty.detail}</div>
      </div>
    );
  }

  return (
    <>
      <div style={styles.intro}>
        These layers were created by this console to composite live sources behind a
        template&rsquo;s holes. Repoint, audio and off-air are the owning row&rsquo;s verbs — open
        the row to reach them.
      </div>
      <div style={styles.list}>
        {rows.map((row) => (
          <div
            key={row.coordinate}
            style={styles.row}
            data-live-layer={row.coordinate}
            data-live-layer-stranded={row.releasable ? 'true' : 'false'}
          >
            <span style={styles.coordinate}>{row.coordinate}</span>
            <div style={styles.body}>
              <span style={{ ...styles.headline, color: row.tone }}>{row.headline}</span>
              <span style={styles.plate}>
                {row.plate} — {row.producer}
              </span>
              <span style={styles.detail}>{row.detail}</span>
            </div>
            {row.releasable ? (
              <AsyncButton
                variant="caution-strong"
                run={() => releaseStranded(row)}
                onError={reportCommandError}
                disabled={releaseRefusal !== undefined}
                {...(releaseRefusal !== undefined ? { title: releaseRefusal } : {})}
                aria-label={releaseLabel(rows, row)}
              >
                RELEASE
              </AsyncButton>
            ) : row.ownerLabel !== null ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onSelectOwner(row.itemId);
                }}
                aria-label={`Open the row that owns live layer ${row.coordinate}`}
              >
                OPEN ROW
              </Button>
            ) : (
              // Blind: no owner resolved and no control, because neither the stranded
              // verdict nor the release could be trusted. The row says which blindness.
              <span aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
      {confirmDialog}
    </>
  );
}

/**
 * The RELEASE control's accessible name, which must state the SAME scope the confirm
 * and the toast will. A screen-reader user pressing "Release stranded live layer 1-10"
 * and losing 1-11 as well would have been told the wrong thing by the one label they
 * had.
 */
function releaseLabel(rows: readonly LiveLayerRowView[], row: LiveLayerRowView): string {
  const scope = releaseScopeOf(rows, row.itemId);
  return scope.length > 1
    ? `Release ${String(scope.length)} stranded live layers (${scope
        .map((r) => r.coordinate)
        .join(', ')})`
    : `Release stranded live layer ${row.coordinate}`;
}

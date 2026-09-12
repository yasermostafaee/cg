import { useRef } from 'react';
import { Info } from 'lucide-react';
import { colors } from '../../theme.js';
import { AsyncButton } from '../../ui/AsyncButton.js';
import { Button } from '../../ui/Button.js';
import { Icon } from '../../ui/Icon.js';
import { useConfirm } from '../../ui/useDialog.js';
import { isContextMenuKey } from '../../ui/useContextMenu.js';
import { useLink } from '../../hooks/useLink.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { BRIDGE_DOWN_REASON, casparRefusalReason } from '../../ui/reachWording.js';
import { reportCommandError, reportCommandSuccess } from '../status/commandFeedback.js';
import {
  liveLayerEmptyView,
  releaseScopeOf,
  seatedPlatesOf,
  type LiveLayerBlindness,
  type LiveLayerRowView,
} from './liveLayerRows.js';
import { PlateAudioStrip } from './PlateAudioStrip.js';

/**
 * What PANIC actually did, as the BRIDGE reports it.
 *
 * ⚠ The shape is the bridge's, carried through unchanged. `silenced` (reached the wire) and
 * `recorded` (intent written, including HELD plates that were already silent) are different
 * numbers on purpose — see the channel's own note.
 */
export interface PanicReport {
  ok: boolean;
  silenced: number;
  recorded: number;
  rows: readonly { itemId: string; plates: number }[];
  failed: readonly { itemId: string; plateId: string; reason: string }[];
}

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
  /**
   * `add-multibox-audio` — apply a MAP of plate volumes to one row's item, in ONE bridge call.
   *
   * Every audio gesture on this panel goes through it: the fader, ON, OFF, SOLO and PANIC.
   * There is no second door and no per-plate variant here, because SOLO and PANIC are
   * CROSS-PLATE statements and a sequence of single-plate calls cannot make one.
   */
  onApplyVolumes: (
    itemId: string,
    volumes: Record<string, number>,
  ) => Promise<{ ok: boolean; refused: string[] }>;
  /**
   * `RUNTIME-REDESIGN-01` Phase 6 — open the OWNING ROW's audio dialog on one plate. The
   * reference's right-click (and its keyboard twins, `ContextMenu` / `Shift+F10`) on a seated
   * plate; the dialog itself is hosted by the panel that holds the stack and the registry.
   */
  onOpenAudio: (itemId: string, plateId: string) => void;
  /**
   * 🔴 **PANIC — and it takes NO SCOPE, which is the whole of the change.**
   *
   * It used to take one: the caller resolved the ON-AIR rows' seated plates from the stack and
   * handed them down. That was `B-122`'s shape one verb along — an emergency control gated on
   * believed status — and it cost two real cases: a row in the boot-adoption window (`B-145`:
   * plates seated and potentially AUDIBLE, status not on air; once misnamed the `exitRehearse`
   * window, `B-216`) was never reached, and a browser whose
   * live-layer snapshot had not yet arrived would have addressed nothing while reporting
   * success for it.
   *
   * The bridge now scopes it from its own LEDGER — every plate it seated, whatever any status
   * claims — and hands back what it did. This panel's job is to press the button and read the
   * answer out loud.
   */
  onPanic: () => Promise<PanicReport>;
}

const styles = {
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
 * The sentence the reference keeps behind its help icon — the tab's own statement of scope.
 *
 * 🔴 IT LOST ITS FIRST CLAUSE ON 2026-09-12, AND THAT IS THE POINT OF THE RENAME.
 *
 * It used to read _"— not the installation's source catalogue, which lives in Station setup"_,
 * and that clause existed for exactly one reason: the tab was called `LIVE SOURCES` and the
 * catalogue is called `Live sources`, so the help text had to spend a sentence undoing the
 * name above it. The tab reads `Live plates` now, so the disclaimer has nothing left to
 * disown — a hint whose job is to contradict its own heading is a heading that needs fixing,
 * not a hint that needs keeping.
 *
 * What survives is everything that is still a FACT the operator cannot read off the table: who
 * owns the verbs, that the audio figure is requested gain rather than a measured signal, and
 * what ON and SOLO actually do.
 */
const SCOPE_NOTE =
  'These are the layers this console seated for a row’s live plates. Repoint and off-air are ' +
  'the owning row’s verbs. Audio is requested gain, not a measured signal. ON sets 100%; SOLO ' +
  'affects one row’s plates, hidden frames included, with no restore.';

/**
 * `B-145` acceptance 1, display half (`tasks.md` 2.8) — **the LIVE PLATES tab: the
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
 * ── 🔴 LIVE PLATES ARE SEATED LAYERS, NOT THE CATALOGUE ────────────────────
 *
 * `RUNTIME-REDESIGN-01` §6: this pane reads the bridge's LEDGER (`liveLayers.state`, through
 * `useLiveLayers` → `liveLayerRows`) — one row per layer the bridge itself seated. The SOURCE
 * CATALOGUE is installation-wide, read from `sources.config` through `sourceStore` and edited
 * in Station setup's `SourcesSection`; nothing here reads it. Different channel, different
 * lifetime, different surface.
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
 * ── THE SHAPE (`07-live-plates.html` as rendered, `design.md` §13.3) ────────
 *
 * A 40 px toolbar — the occupied count, shown · held, the scope note behind an info icon and
 * the panic button — over a seven-column table: Layer · Plate / source · Owner · Picture ·
 * Audio · Gain · Audio controls, 30 px head, 42 px rows. Every row is focusable and opens the
 * owning row's audio dialog on RIGHT-CLICK, `ContextMenu` or `Shift+F10` — the reference's
 * gesture, with keyboard parity. The words are the app's own (`liveLayerRows`); only the
 * geometry moved. A row that needs attention — stranded, blind, adopted — keeps its full
 * sentence on a second line, because that sentence is the alarm.
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
export function LiveSourcesPanel({
  rows,
  ledgerReady,
  blind,
  onSelectOwner,
  onApplyVolumes,
  onOpenAudio,
  onPanic,
}: Props): JSX.Element {
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
   * 🔴 **THE AUDIO CONTROLS ASK A NARROWER QUESTION THAN RELEASE DOES — the BRIDGE hop only,
   * not the CasparCG one — and the difference is a real affordance rather than a nicety.**
   *
   * Setting a plate's volume is a CONFIGURATION verb (golden rule 10). On a row that owns no
   * live seats the bridge records the intent and sends NOTHING, so an unreachable playout
   * machine has no bearing on whether the press can be done — and arming a plate's audio while
   * the plant is being brought back up is exactly when an operator wants to. Refusing it for
   * `CASPAR_UNREACHABLE` would take away the before-the-take affordance the mute rule exists
   * to preserve.
   *
   * With the BRIDGE down the call cannot leave the browser at all, so that one still refuses.
   * Where a send IS owed — a row that owns its seats — the bridge answers `disconnected` and
   * the operator is told by the toast, which is the honest place for a refusal only the bridge
   * can know it must make.
   */
  const audioRefusal = linkDown ? BRIDGE_DOWN_REASON : undefined;

  /**
   * Apply a map for one row, and turn the bridge's PER-PLATE verdicts into one sentence.
   *
   * ⚠ The per-plate detail is not decoration: a SOLO across four plates can land three and be
   * refused on the fourth, and an operator told only "failed" would re-press it — re-applying
   * three changes that already landed — while one told "ok" would leave a guest audible with
   * nothing saying so. The toast names the plates that did not move.
   */
  const applyAndReport = async (
    itemId: string,
    volumes: Record<string, number>,
  ): Promise<{ ok: boolean; refused: string[] }> => {
    const res = await onApplyVolumes(itemId, volumes);
    if (!res.ok) {
      reportCommandError(
        res.refused.length > 0
          ? `Audio not applied to ${res.refused.join(', ')} — those plates are unchanged.`
          : 'The audio change was refused.',
      );
    }
    return res;
  };

  /**
   * PANIC — silence every plate the BRIDGE holds a seat for, from one press.
   *
   * ⚠ **NO CONFIRM, deliberately.** An emergency control behind a dialog is one that does not
   * happen; the dialog next door makes the same argument for its own OFF button. Silencing is
   * also the RECOVERABLE direction — the faders are still there — which a CLEAR is not, and
   * that is the line this product draws for a confirm.
   *
   * 🔴 **THE SCOPE IS NOT COMPUTED HERE ANY MORE.** It was, and the panel resolved it from the
   * on-air rows — so a seated-but-not-on-air row was never silenced, and a browser whose
   * ledger snapshot had not arrived would have silenced nothing and said it worked. Both are
   * `B-122`'s shape. The bridge answers from its ledger; this reads the answer out.
   *
   * The wording says what ACTUALLY went, and it distinguishes the two numbers the bridge
   * distinguishes: `silenced` reached the wire, while a HELD plate was already silent and only
   * had its intent recorded — so that when its look comes back it stays silent instead of
   * returning at whatever it was before.
   */
  const panic = async (): Promise<{ accepted: boolean; cancelled?: boolean }> => {
    const res = await onPanic();
    if (res.failed.length > 0) {
      const names = res.failed.map((f) => f.plateId).join(', ');
      reportCommandError(
        `Silenced ${String(res.silenced)} plate(s), but ${names} did not take — those may ` +
          `still be audible.`,
      );
      return { accepted: false, cancelled: true };
    }
    if (!res.ok || res.recorded === 0) {
      // A no-op is NEVER a success. `B-122`: an operator told the escape hatch worked while
      // the thing is still on air is worse off than one told nothing happened.
      reportCommandError(
        'Nothing was sent — the bridge holds no live plates, so there was nothing to silence.',
      );
      return { accepted: false, cancelled: true };
    }
    const held = res.recorded - res.silenced;
    reportCommandSuccess(
      `Silenced · ${String(res.silenced)} plate(s) on ${String(res.rows.length)} row(s)` +
        (held > 0
          ? ` · ${String(held)} already silent in the current look, now armed silent too`
          : ''),
    );
    return { accepted: true };
  };

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
      /*
        `B-233` / golden rule 11 — THE LAYERS, NOT THE ITEM ID. This read
        `Nothing was sent — item-e602d912-… is no longer stranded.`, which put a raw UUID in
        front of an operator at the one moment he is being told his press did nothing.

        ⭐ **The id is not relocated here, it is DROPPED, and that is the right call rather
        than an exception to the rule.** A toast has no `title` and no copy button, so there
        is nowhere to put it — but there is also nothing to put: the SUBJECT of this sentence
        is the layer set the operator just pressed Release on, his button said
        `Release stranded live layer 1-10`, and `R-028` keeps that coordinate visible for
        exactly this reason. Naming it back to him is a more direct reference than any id,
        and the owning row is named on the panel row beside the toast.
      */
      reportCommandError(
        `Nothing was sent — ${names} ${many ? 'are' : 'is'} no longer stranded. The row that ` +
          `owns ${many ? 'them' : 'it'} is back on the stack, so use that row's own verbs.`,
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
    reportCommandSuccess(`Released · ${names}`);
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

  // The toolbar's counts, off the SAME rows the table renders. A row whose audio the console
  // cannot state (blind, stranded) is in neither count — "shown" and "held" are claims.
  const shownCount = rows.filter((r) => r.audio !== null && !r.audio.held).length;
  const heldCount = rows.filter((r) => r.audio?.held === true).length;

  /**
   * The reference's gesture: a right-click (or its keyboard twins) on a seated plate opens the
   * OWNING ROW's audio dialog on that plate. Only a row the console can honestly state audio
   * for — `audio !== null` — has an owner to open; a stranded or blind row does nothing here,
   * and the app-wide suppressor keeps the browser's own menu away (guard item 23).
   */
  const openAudioFor = (row: LiveLayerRowView): boolean => {
    if (row.audio === null) return false;
    onOpenAudio(row.itemId, row.plate);
    return true;
  };

  return (
    <>
      <div className="cg-plate-toolbar" data-plate-toolbar="">
        <strong>
          {String(rows.length)} occupied {rows.length === 1 ? 'layer' : 'layers'}
        </strong>
        <span className="cg-plate-count">
          {String(shownCount)} shown · {String(heldCount)} held
        </span>
        <span className="cg-plate-spacer" />
        {/*
          The scope note behind the reference's info glyph, through the delegated Tooltip; the
          same sentence is this tab's own doc-comment, and the toolbar's counts say the rest.
        */}
        <span className="cg-plate-help" title={SCOPE_NOTE} aria-label={SCOPE_NOTE} role="img">
          <Icon icon={Info} size={16} />
        </span>
        {/*
          PANIC AT THE HEAD, not per row: it is the only control here whose scope is EVERY
          row, and a control that acts on the whole list belongs above the list rather than
          repeated inside it. `caution-strong` and not `danger` — red is this palette's
          error-and-destructive hue, and silencing is neither: the pictures stay on air and
          the faders are still there.

          🔴 `RUNTIME-REDESIGN-01` Phase 8, owner answer A16 — THE LABEL NAMES ITS SCOPE.
          `stack.silenceAllLivePlates` takes no arguments ON PURPOSE (`R-062`): PANIC's scope
          is the bridge's whole ledger — every seated plate on every channel this bridge
          drives, not the channel selected above — and that scope is not the caller's to
          choose. Whether a multi-channel plant wants a per-channel silence beside it is a
          precondition of ever shipping real multi-channel, decided then, with the operator's
          workflow in front of us. Until then the assumption is written where the operator
          reads it, so that when multi-channel arrives THIS LABEL is the thing that has to
          change and cannot be forgotten. Golden rule 11: the scope in the operator's words.
          No behaviour change, no wire change.
        */}
        <AsyncButton
          variant="caution-strong"
          run={panic}
          onError={reportCommandError}
          disabled={audioRefusal !== undefined}
          title={
            audioRefusal ??
            'Set EVERY live plate the bridge has seated to zero, on EVERY channel this bridge ' +
              'drives — not only the channel selected above, and including rows this ' +
              'console does not show as on air. The pictures stay on air. There is no ' +
              'un-panic — raise what you need again on its own fader.'
          }
          aria-label="Silence all boxes on every channel — set every live plate the bridge has seated to zero, whichever channel it is on"
        >
          SILENCE ALL BOXES · EVERY CHANNEL
        </AsyncButton>
      </div>
      <div className="cg-plate-table" role="table" aria-label="Occupied live-plate layers">
        <div className="cg-plate-head" role="row">
          <span role="columnheader">Layer</span>
          <span role="columnheader">Plate / source</span>
          <span role="columnheader">Owner</span>
          <span role="columnheader">Picture</span>
          <span role="columnheader">Audio</span>
          <span role="columnheader">
            Gain <span className="cg-plate-head-note">· ON = 100%</span>
          </span>
          <span role="columnheader">Audio controls</span>
        </div>
        {rows.map((row) => {
          // Every disposition but the ordinary one keeps its sentence visible (see below).
          const attention = !row.plain;
          return (
            <div
              key={row.coordinate}
              role="row"
              className={`cg-plate-row${attention ? ' cg-plate-row--attention' : ''}`}
              data-live-layer={row.coordinate}
              data-live-layer-stranded={row.releasable ? 'true' : 'false'}
              // The row is the keyboard's target for the audio dialog (`Shift+F10` /
              // `ContextMenu`), exactly as the reference's `<tr tabindex="0">` is.
              tabIndex={0}
              aria-label={`${row.plate} on ${row.coordinate} · ${row.headline}${
                row.audio !== null ? ' · right-click for audio' : ''
              }`}
              title={row.detail}
              onContextMenu={(e) => {
                if (openAudioFor(row)) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onKeyDown={(e) => {
                if (!isContextMenuKey(e)) return;
                if (openAudioFor(row)) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              <span role="cell" className="cg-plate-coord">
                {row.coordinate}
              </span>
              <span role="cell" className="cg-plate-source">
                <span className="cg-plate-slot" title="Template plate handle">
                  {row.plate}
                </span>
                <bdi className="cg-plate-producer" title={row.producer}>
                  {row.producer}
                </bdi>
              </span>
              <span role="cell" className="cg-plate-owner">
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
                  <>
                    {/* The owner NAMED, in its own bidi isolate, then the way to it. */}
                    <span className="cg-plate-owner-lead">Seated for</span>
                    <bdi className="cg-plate-owner-name">{row.ownerLabel}</bdi>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        onSelectOwner(row.itemId);
                      }}
                      title={`Open the row that owns live layer ${row.coordinate} and its Inspector`}
                      aria-label={`Open the row that owns live layer ${row.coordinate}`}
                    >
                      OPEN ROW
                    </Button>
                  </>
                ) : (
                  // Blind: no owner resolved and no control, because neither the stranded
                  // verdict nor the release could be trusted. The row says which blindness.
                  <span aria-hidden="true">—</span>
                )}
              </span>
              <span role="cell" className="cg-plate-picture" style={{ color: row.tone }}>
                {row.headline}
              </span>
              {/*
                The audio strip renders itself away when the console cannot honestly state
                this plate's audio — blind, or stranded. That decision lives on the ROW
                (`LiveLayerRowView.audio`), computed in the one pass that produced everything
                else on this surface, so the strip and the headline can never disagree about
                whether anything is knowable.
              */}
              <PlateAudioStrip
                row={row}
                siblings={seatedPlatesOf(rows, row.itemId)}
                refusal={audioRefusal}
                onApply={(volumes) => applyAndReport(row.itemId, volumes)}
              />
              {/*
                Every row but the ordinary ON SCREEN one keeps its whole sentence VISIBLE, on a
                second line across the table: for a stranded layer that sentence IS the alarm (a
                live face on air that no row can reach), for an adopted one it is the caveat
                that nothing has confirmed the layer, and for a held one it is why the guest is
                silent. An alarm behind a hover is not an alarm. The ordinary row's sentence —
                which the Owner cell already says — rides its `title`.
              */}
              {attention && (
                <span role="cell" className="cg-plate-detail">
                  {row.detail}
                </span>
              )}
            </div>
          );
        })}
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

import { useMemo } from 'react';
import {
  CLEARED_BY_PLAYOUT_LICENSE,
  type ClearedOutsideLayer,
  type OrphanLayer,
  type OwnedOccupancyWarning,
} from '@cg/shared-ipc';
import { colors, cssVars } from '../../theme.js';
import { Button } from '../../ui/Button.js';
import { NoticeDismiss } from '../../ui/Notice.js';
import { OperatorNames } from '../../ui/OperatorNames.js';
import { operatorRowName } from '../../ui/operatorNaming.js';
import { useConfirm } from '../../ui/useDialog.js';
import { useCasparReach } from '../../hooks/useCasparReachable.js';
import { useFixedBanks } from '../../hooks/useFixedLayers.js';
import { useLink } from '../../hooks/useLink.js';
import { useStack } from '../../hooks/useStack.js';
import { useTemplateIndex } from '../../hooks/useTemplateIndex.js';
import { casparRefusalReason } from '../../ui/reachWording.js';
import { runCommand } from '../status/commandFeedback.js';
import {
  clearAllListed,
  dismissClearedOutside,
  dismissForeignStrip,
  foreignNoticeChannels,
  isOrphanedGraphic,
  noticedClearedOutside,
  noticedForeign,
  offersClear,
  useForeignDismissals,
  type ForeignDismissals,
} from './foreignNotice.js';

/**
 * 🔴 `MULTI-CHANNEL-01` §2 L — the channels whose view this banner WARNS in: an owned-slot
 * occupancy, or a notice about another system's content that stands. `FIELD-FIXES-01` L: that is
 * content INSIDE CG's bands, in a strip the operator has not dismissed — either strip, graphic or
 * video, because inside the bands both are a conflict with ours. Below the bands it is the
 * Playout's, and marks nothing. One rule with the strips below (`foreignNotice.ts`), never a
 * second copy.
 *
 * `B-292` — and a layer of ours cleared outside CG Control, while its strip stands.
 */
export function orphanWarningChannels(
  orphans: readonly OrphanLayer[],
  ownedOccupancy: readonly OwnedOccupancyWarning[],
  dismissals: ForeignDismissals,
  clearedOutside: readonly ClearedOutsideLayer[] = [],
): number[] {
  return [
    ...new Set([
      ...foreignNoticeChannels(orphans, dismissals),
      ...ownedOccupancy.map((w) => w.channel),
      ...noticedClearedOutside(clearedOutside, dismissals).map((e) => e.channel),
    ]),
  ];
}

interface Props {
  /** `MULTI-CHANNEL-01` §2 L — the channel on screen's only, on a multi-channel station (`App`). */
  orphans: readonly OrphanLayer[];
  /** B-056 — owned-slot occupancy warnings (distinct variant, no Clear). */
  ownedOccupancy: readonly OwnedOccupancyWarning[];
  /** `B-292` — layers of ours cleared outside CG Control (the channel on screen's, like `orphans`). */
  clearedOutside: readonly ClearedOutsideLayer[];
}

const styles = {
  /* The reference's `.notice.warn` box (`RUNTIME-REDESIGN-01` Phase 9, `NOTICE_PX`). */
  strip: {
    border: `1px solid ${cssVars['--r-notice-line']}`,
    background: cssVars['--r-notice-fill'],
    borderRadius: cssVars['--r-notice-radius'],
    padding: cssVars['--r-notice-pad'],
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    fontSize: cssVars['--r-notice-fs'],
    lineHeight: cssVars['--r-notice-lh'],
    color: cssVars['--r-caution-text'],
  },
  // R-015 — the neutral strip: an occupied-but-not-ours VIDEO layer is a
  // normal fact of the console, not a problem. Neutral tones only (never
  // amber, never the on-air red) — there is essentially always a video layer
  // in play, and a warning colour here would permanently imply something is
  // wrong when nothing is. Phase 9: the reference's PLAIN `.notice` pair, which
  // is what a neutral statement looks like there; it used to borrow the panel's
  // own surface, which made the strip indistinguishable from a panel.
  neutralStrip: {
    border: `1px solid ${cssVars['--r-notice-neutral-line']}`,
    background: cssVars['--r-notice-neutral-bg'],
    borderRadius: cssVars['--r-notice-radius'],
    padding: cssVars['--r-notice-pad'],
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    fontSize: cssVars['--r-notice-fs'],
    lineHeight: cssVars['--r-notice-lh'],
    color: cssVars['--r-notice-neutral-text'],
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  // `FIELD-FIXES-01` L — a dismissible strip is a ROW: its lines in a column, the dismiss at the
  // inline end, inside the box (`Notice`'s own arrangement for a message that carries a control).
  dismissible: { flexDirection: 'row' as const, alignItems: 'start', gap: '0.6rem' },
  lines: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '0.4rem',
    flex: 1,
    minWidth: 0,
  },
  detail: { color: colors.textMuted, fontSize: '0.78rem' },
  // `B-292` — a strip's CLEAR ALL LISTED sits under its rows, at the inline end.
  allRow: { display: 'flex', justifyContent: 'flex-end' },
} as const;

/**
 * R-009 — orphaned/unknown on-air layers. Fed by the bridge's periodic
 * occupancy sweep (a passive OSC tap compared against owned slots): each row
 * names a layer that has a producer but is NOT on the operator's stack.
 *
 * R-015 — the set SPLITS by observed producer kind, because the two kinds
 * mean opposite things to a graphics operator:
 *
 *   - `html` — plausibly OUR OWN graphic riding through a dead bridge
 *     session (this system only ever places HTML producers). Keeps the
 *     warning strip and the explicit, confirm-gated Clear — R-009's case,
 *     unchanged.
 *   - anything else (`ffmpeg`, `decklink`, … — "not html" fails safe) —
 *     another system's output: a video, a program feed. Rendered as NEUTRAL
 *     information, never an alert.
 *
 * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B3 — the owner, 2026-09-29) SUPERSEDES R-015's "no Clear on a
 * video layer" INSIDE THE THREE BANDS: "this system only ever places HTML" stopped being true with
 * plates, and a plate another station or a lost ledger left in 60–79 had no surface that could clear
 * it. Every listed layer inside 50–99 carries a confirm-gated CLEAR (`offersClear`, the bridge's own
 * rule), and a strip listing two or more of them carries CLEAR ALL LISTED (`clearAllListed`: one
 * confirm, one `layers.clear` per layer, never a channel-wide `CLEAR`). Above the bands a non-`html`
 * row still offers none. A ledger plate or a stack item's layer is never listed here at all.
 *
 * `B-292` (B1) — and a third strip, first: a layer of OURS that something else cleared, in the
 * owner's words ("Layer 60 on CH 2 was cleared outside CG Control"), dismissible like the others.
 *
 * Renders NOTHING when there are no orphans (idle-quiet), persists while the
 * orphan persists (never auto-dismissed), and every html Clear is an
 * explicit, confirm-gated operator act — the row disappears when the bridge
 * observes the layer empty on a later sweep (never optimistically).
 *
 * `FIELD-FIXES-01` L — both strips speak only for layers INSIDE CG's bands, and each is
 * DISMISSIBLE: the operator's dismissal holds until the strip holds a new layer or a different
 * producer (`foreignNotice.ts`). Another system's layer below the bands is the Playout's and
 * normal — it is listed on the Station layers tab, never here.
 *
 * B-056 — the same banner also renders the owned-slot occupancy warnings as
 * a DISTINCT strip: a load's adopt-CLEAR missed the primary over observed
 * foreign content, so a previous session's graphic may be live on the
 * primary under the named item's own layer. No Clear button — the layer IS
 * owned (the bridge refuses `layers.clear` on it); the remedy is Out/Remove
 * of the item, and the row disappears only on the bridge's provable resolve.
 */
export function OrphanLayersBanner({
  orphans,
  ownedOccupancy,
  clearedOutside,
}: Props): JSX.Element | null {
  // Above the idle-quiet early return: a hook cannot be called conditionally.
  const { confirm, confirmDialog } = useConfirm();
  /**
   * THIS CLEAR EMITS AMCP, so it is gated on BOTH hops like every other one.
   *
   * It was not in the sweep that gated the row and header verbs — not a decision,
   * simply a surface nobody listed — and it is the one Clear an operator reaches
   * for when the console's own model has already failed them, which makes an
   * enabled-but-dead button costlier here than anywhere else: they press it,
   * believe the layer is coming off, and watch a graphic they cannot account for
   * stay on air.
   *
   * Gating it does NOT re-gate on LAYER STATE — the orphan row exists precisely
   * because the layer is carrying something we did not put there, and that fact is
   * never a reason to refuse the remedy. Only reachability is, because with either
   * hop down the command does not leave at all.
   */
  const linkDown = useLink() === 'disconnected';
  const casparReach = useCasparReach();
  const clearRefusal = casparRefusalReason(linkDown, casparReach);
  const dismissals = useForeignDismissals();

  /*
    🔴 `B-233` — WHAT THIS BANNER NEEDED IN ORDER TO NAME THE OWNING ROW.

    `B-232` left the occupancy strip printing a raw `itemId` and said why: _"Naming the
    owning item needs the STACK (to reach its templateId) and the REGISTRY, and this banner
    holds neither."_ That was true and it is what these three hooks supply.

    ⭐ **The hooks are called HERE rather than threaded from `App` as props.** `B-232` did
    thread `emptiedAirRows` down, and the reason it gave was specific: the strip and the
    marked ROWS had to describe the SAME set, which two independent subscriptions could not
    guarantee. Nothing here is mirrored on a second surface — this strip is the only place
    these warnings are named — so there is no agreement to protect, and three more props
    through `App` would couple it to this banner's copy for nothing.

    ⚠ No wire change, and the contrast with the restore-SKIPS strip is the instructive part:
    an occupancy warning names an item whose LOAD raised it, so that item is ON the stack and
    the join succeeds. A skipped row is by definition NOT on the stack, which is why that one
    needed `RestoreSkipSchema` widened and this one does not.
  */
  const items = useStack();
  // `MULTI-CHANNEL-01` — every declared bank: an owner is named from ITS channel's bank, which
  // needs the list and not the selection.
  const bank = useFixedBanks();
  // `CHANNEL-TEMPLATES-01` — each item's template as its own channel lists it.
  const templateRefs = useMemo(
    () => items.map((i) => ({ templateId: i.templateId, channel: i.slot?.channel })),
    [items],
  );
  const templates = useTemplateIndex(templateRefs);
  /*
    🔴 **NO `slot` IS PASSED, AND `B-232`'s NOTE IS WHY.** It warned that naming this owner by
    its LAYER "would just repeat the coordinate the sentence has already printed two words
    earlier". The first spelling of this fix passed the slot anyway and CI proved the note
    right twice over: the strip rendered

        "⚠ Layer 1-10 may still show … put there by layer 10 (not a row) · News Composite"

    — the coordinate said twice, and `(not a row)` asserted about a layer that an item on the
    stack demonstrably owns. `placeName` is correct in isolation (layer 10 is outside the
    declared bank in that fixture) and wrong for THIS sentence, because the warning's
    coordinate IS the owning item's own layer.

    So the composition is asked for the one thing the sentence does not already say: WHICH
    graphic. `operatorRowName` falls back to a shortened id when the template is unknown,
    which is the documented last resort and still not a raw UUID.
  */
  const ownerName = (w: OwnedOccupancyWarning): ReturnType<typeof operatorRowName> =>
    operatorRowName(
      {
        itemId: w.itemId,
        ...(() => {
          const templateId = items.find((i) => i.itemId === w.itemId)?.templateId;
          return templateId !== undefined ? { templateId } : {};
        })(),
      },
      bank,
      templates,
    );

  /*
    `FIELD-FIXES-01` L — only what the notice speaks for: another system's content INSIDE CG's
    bands, in a strip the operator has not dismissed.
  */
  const noticed = noticedForeign(orphans, dismissals);
  // `B-292` — a layer of ours cleared outside CG Control, in a strip the operator has not dismissed.
  const cleared = noticedClearedOutside(clearedOutside, dismissals);
  if (noticed.length === 0 && ownedOccupancy.length === 0 && cleared.length === 0) return null;

  // R-015 — the discriminator between the two strips is the OBSERVED kind, never a layer number.
  const htmlOrphans = noticed.filter(isOrphanedGraphic);
  const foreignLayers = noticed.filter((o) => !isOrphanedGraphic(o));

  /**
   * One layer's Clear. Explicit and confirm-gated (the B-048 principle: the operator decides, never
   * a heuristic). Errors surface via the command-error toast; success shows as the row disappearing
   * when the sweep observes the layer empty — never optimistically.
   */
  const clearOne = (o: OrphanLayer): void => {
    const name = `${String(o.channel)}-${String(o.layer)}`;
    void (async () => {
      const ok = await confirm({
        title: `Clear layer ${name}?`,
        body: 'This removes whatever is on that layer from air.',
        confirmLabel: 'Clear layer',
        tone: 'clear',
      });
      if (!ok) return;
      runCommand(
        `Clear layer ${name}`,
        window.cg.layers
          .clear({ channel: o.channel, layer: o.layer })
          .then((r) => ({ accepted: r.ok })),
      );
    })();
  };

  /**
   * 🔴 `B-292` (`RELEASE-091-01` DELTA B, B3) — **CLEAR ALL LISTED**: ONE confirm naming every layer
   * it will send, then one `layers.clear` per layer, in turn — never a channel-wide `CLEAR`, never a
   * layer outside 50–99 ({@link clearAllListed}). A layer the bridge refuses does not stop the rest;
   * the toast says the batch was not wholly accepted.
   */
  const clearListed = (targets: readonly OrphanLayer[]): void => {
    const names = targets.map((o) => `${String(o.channel)}-${String(o.layer)}`);
    const count = String(targets.length);
    void (async () => {
      const ok = await confirm({
        title: `Clear ${count} layers?`,
        body: `This removes whatever is on layers ${names.join(', ')} from air.`,
        confirmLabel: `Clear ${count} layers`,
        tone: 'clear',
      });
      if (!ok) return;
      runCommand(
        `Clear layers ${names.join(', ')}`,
        (async () => {
          let accepted = true;
          for (const o of targets) {
            const r = await window.cg.layers.clear({ channel: o.channel, layer: o.layer });
            if (!r.ok) accepted = false;
          }
          return { accepted };
        })(),
      );
    })();
  };

  const clearButton = (o: OrphanLayer): JSX.Element => {
    const name = `${String(o.channel)}-${String(o.layer)}`;
    return (
      <Button
        variant="caution"
        aria-label={`Clear layer ${name}`}
        disabled={clearRefusal !== undefined}
        title={
          clearRefusal ?? `Send CLEAR ${name} — removes whatever is on that layer from the output`
        }
        onClick={() => {
          clearOne(o);
        }}
      >
        CLEAR
      </Button>
    );
  };

  /** `B-292` — a strip's CLEAR ALL LISTED, when it lists two or more layers it may clear. */
  const clearAllRow = (rows: readonly OrphanLayer[]): JSX.Element | null => {
    const targets = clearAllListed(rows);
    if (targets.length < 2) return null;
    return (
      <div style={styles.allRow}>
        <Button
          variant="caution"
          aria-label="Clear all listed layers"
          disabled={clearRefusal !== undefined}
          title={
            clearRefusal ??
            `Send CLEAR ${targets.map((o) => `${String(o.channel)}-${String(o.layer)}`).join(', ')}`
          }
          onClick={() => {
            clearListed(targets);
          }}
        >
          CLEAR ALL LISTED
        </Button>
      </div>
    );
  };

  return (
    <>
      {cleared.length > 0 && (
        <div
          style={{ ...styles.strip, ...styles.dismissible }}
          role="alert"
          aria-label="Layers cleared outside CG Control"
        >
          <div style={styles.lines}>
            {cleared.map((e) => {
              const name = `${String(e.channel)}-${String(e.layer)}`;
              return (
                <div key={name} style={styles.row} data-cleared-outside={name}>
                  <span>
                    {/* `PLAYOUT-FEATURES-01` D — the Playout's own license rule, when D4 said so. */}
                    {e.cause === 'playout-license'
                      ? `Layer ${String(e.layer)} on CH ${String(e.channel)} — ${CLEARED_BY_PLAYOUT_LICENSE}`
                      : `Layer ${String(e.layer)} on CH ${String(e.channel)} was cleared outside CG Control`}
                  </span>
                </div>
              );
            })}
          </div>
          <NoticeDismiss
            label="Dismiss this notice"
            onDismiss={() => {
              dismissClearedOutside(clearedOutside);
            }}
          />
        </div>
      )}
      {htmlOrphans.length > 0 && (
        <div
          style={{ ...styles.strip, ...styles.dismissible }}
          role="alert"
          aria-label="Orphaned on-air layers"
        >
          <div style={styles.lines}>
            {htmlOrphans.map((o) => {
              const name = `${String(o.channel)}-${String(o.layer)}`;
              return (
                <div key={name} style={styles.row}>
                  <span>
                    ⚠ Layer {name} is on air but not on your stack{' '}
                    <span style={styles.detail}>
                      ({o.producer} producer — likely left by a previous session)
                    </span>
                  </span>
                  {clearButton(o)}
                </div>
              );
            })}
            {clearAllRow(htmlOrphans)}
          </div>
          <NoticeDismiss
            label="Dismiss this notice"
            onDismiss={() => {
              dismissForeignStrip(orphans, 'graphic');
            }}
          />
        </div>
      )}
      {foreignLayers.length > 0 && (
        <div
          style={{ ...styles.neutralStrip, ...styles.dismissible }}
          role="status"
          aria-label="Layers in use by other systems"
        >
          <div style={styles.lines}>
            {foreignLayers.map((o) => {
              const name = `${String(o.channel)}-${String(o.layer)}`;
              return (
                <div key={name} style={styles.row}>
                  {/*
                    🔴 `B-292` — inside the three bands this row carries a CLEAR, whatever the
                    producer (`offersClear`, the bridge's own rule). Above them it still offers
                    none, and says so.
                  */}
                  {offersClear(o) ? (
                    <>
                      <span>
                        Layer {name} is carrying video ({o.producer}) — placed by another system.
                      </span>
                      {clearButton(o)}
                    </>
                  ) : (
                    <span>
                      Layer {name} is carrying video ({o.producer}) — placed by another system.{' '}
                      <span style={styles.detail}>Not clearable from here.</span>
                    </span>
                  )}
                </div>
              );
            })}
            {clearAllRow(foreignLayers)}
          </div>
          <NoticeDismiss
            label="Dismiss this notice"
            onDismiss={() => {
              dismissForeignStrip(orphans, 'video');
            }}
          />
        </div>
      )}
      {ownedOccupancy.length > 0 && (
        <div style={styles.strip} role="alert" aria-label="Owned-layer occupancy warnings">
          {ownedOccupancy.map((w) => {
            const name = `${String(w.channel)}-${String(w.layer)}`;
            const owner = ownerName(w);
            return (
              /*
                `B-233` / golden rule 11 — THE ID IS RELOCATED, NOT DELETED. A name can be
                renamed or repeated and an id cannot, so the full `item …` / `template …`
                pair stays reachable on the row's `title` for the moment somebody has to
                quote it to an engineer. What changed is which of the two is in the
                SENTENCE.
              */
              <div key={name} style={styles.row} title={owner.title}>
                <span>
                  {/*
                    `B-233` — THE OWNING ROW, IN THE OPERATOR'S WORDS. This said
                    `under item "item-e602d912-…"`.

                    ⭐ It names the row and its template rather than repeating the
                    coordinate: `Layer 1-70` is already the first two words of the sentence,
                    and `B-232`'s note was right that naming the owner by its layer would
                    say the same thing twice. What the operator is missing is WHICH of his
                    rows put it there — and that is a name, which is what he will look for
                    in the table below.

                    Each name in its own `<bdi>`: the row name is Persian, the template name
                    is usually Latin, and the ` · ` between them is a neutral.
                  */}
                  ⚠ Layer {name} may still show a previous session’s graphic on the primary, put
                  there by <OperatorNames name={owner} />{' '}
                  <span style={styles.detail}>
                    ({w.producer} producer observed when the item loaded and the primary could not
                    be cleared — Out or Remove the item to clear it)
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {confirmDialog}
    </>
  );
}
